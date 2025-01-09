const fetch = require('node-fetch');
const mailingManager = require('./mailing');
const mailSend = require("../helpers/mailSend");

const Queue = require('bull');
const redisUri = process.env.REDIS_URI || 'x-notify-redis';
const redisPort = process.env.REDIS_PORT || '6379';
const redisSentinel1Uri = process.env.REDIS_SENTINEL_1_URI || '127.0.0.1';
const redisSentinel1Port = process.env.REDIS_SENTINEL_1_PORT || '26379';
const redisSentinel2Uri = process.env.REDIS_SENTINEL_2_URI || '127.0.0.1';
const redisSentinel2Port = process.env.REDIS_SENTINEL_2_PORT || '26379';
const redisMasterName = process.env.REDIS_MASTER_NAME || 'x-notify-master';

var maxCompletedJobs = process.env.COMPLETED_JOBS_TO_KEEP || 300;
const BASE_URL = process.env.BASE_URL || "https://apps.canada.ca/x-notify"
const bulkAPI = "https://api.notification.canada.ca/v2/notifications/bulk"

let redisConf = {};
if (process.env.NODE_ENV === 'prod') {
	redisConf = {
		redis: {
			sentinels: [
				{ host: redisSentinel1Uri, port: redisSentinel1Port },
				{ host: redisSentinel2Uri, port: redisSentinel2Port }
			],
			name: redisMasterName,
			host: redisUri,
			port: redisPort
		}
	}
} else {
	redisConf = {
		redis: {
			host: redisUri,
			port: redisPort,
		}
	}
}


const bulkQueDemo = = new Queue('bulk-demo', redisConf);
const bulkQueue = new Queue('bulk-api', redisConf);
exports.bulkQueue = bulkQueue;

bulkQueDemo.process( async (job) => {
	fetch("http://localhost:8080/fail")
		.then(response => {
			if (!response.ok) {
				console.log("=== bulk api delivery error ===");
				console.log(response);
				throw new Error(`HTTP error! Status: ${response.status}`);
			}
			return response.json();
		})
		.then( result => {
			console.log(" ============ result ========== ")
			console.log( result )
			//mailingManager.mailingUpdate( jobData.mailingId, mailingState.sent, { historyState: mailingState.sending } );
		})
		.catch( error => {
			console.log(" ============ error ========== ")
			console.error('Error:', error);
		});

})
// Process jobs
bulkQueue.process(async (job) => {
	try {
		let mailingState = mailingManager.mailingState;
		let jobData = job.data;

		// Making the Bulk API POST request
		fetch(bulkAPI, {
		  method: 'POST',
		  headers: {
			'Content-Type': 'application/json',
			"Authorization" : "ApiKey-v1 " + jobData.notifyKey
		  },
		  body: JSON.stringify( jobData.bulkEmailBody ),
		})
		.then(response => {
			if (!response.ok) {
				console.log("=== bulk api delivery error ===");
				console.log(response);
				throw new Error(`HTTP error! Status: ${response.status}`);
			}
			return response.json();
		})
		.then( result => {
			mailingManager.mailingUpdate( jobData.mailingId, mailingState.sent, { historyState: mailingState.sending } );
		})
		.catch( error => {
			console.error('Error:', error);
		});


	} catch (error) {
		if (error.message.includes('HTTP Error: 5')) {
		  throw new Error('Retryable error'); // Ensures Bull retries
		}
	}
});


exports.retryJobs = async ( req, res, next ) => {
	// Add a job with retry and exponential backoff settings
	bulkQueDemo.add(
	  //{ url: 'http://localhost:8080/fail' },
		{},
	  {
		attempts: 5, // Maximum number of retries
		backoff: {
		  type: 'exponential', // Use exponential backoff
		  delay: 5000 // Initial delay of 1 second (doubles each retry)
		}
	  }
	);

	res.redirect("http://canada.ca");
}


// Listen for failures
bulkQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed: ${err.message}`);
});

exports.sendBulkEmails = async ( mailingId, topicId, subject, mailingBody ) => {
	try {
		let mailing_name = "Bulk_email-" + topicId;
		let mailingTopic = await mailingManager.getTopic( topicId );

		if ( !mailingTopic ) {
			console.log( " Bulkmailer -- sendBulkEmails mailingTopic" );
			console.log( e );
			throw new Error( "Bulkmailer sendBulkEmails: Can't find the topic: " +  topicId );
		}

		if ( !mailingTopic.nTemplateMailingId || !mailingTopic.notifyKey ) {
			console.log( " Bulkmailer -- sendBulkEmails : check mailingTopic details" );
			console.log( e );
			throw new Error( "Bulkmailer sendBulkEmails: Can't find the topic: " +  topicId );
		}

		let subscribers = await mailSend.getConfirmedSubscriberAsArray( topicId );
		if ( !subscribers.length) {
			console.log( " Bulkmailer -- sendBulkEmails : No subscribers" );
			console.log( e );
			throw new Error( "Bulkmailer sendBulkEmails: No subscribers for the topic: " +  topicId );
		}

		let formattedSubsArray = await formatSubsArray( subscribers, mailingBody, subject);
		let bulkEmailBody = {
			"name": mailing_name,
			"template_id": mailingTopic.nTemplateMailingId,
			"rows": formattedSubsArray
		}

		bulkQueue.add(
		{
			bulkEmailBody: bulkEmailBody,
			notifyKey: mailingTopic.notifyKey,
			mailingId: mailingId,
		},
		{
			attempts: 5, // Maximum number of retries
			backoff: {
			  type: 'exponential', // Use exponential backoff
			  delay: 5000 // Initial delay of 1 second (doubles each retry)
			}
		}
		);
	} catch (err) { 
		throw Error('sendBulkEmails error: ' + err, 500)
	}
}

formatSubsArray = async ( listEmail, mailingBody, subject) => {

	let i, i_len = listEmail.length, subscriber;
	let subsArray = [
			["subject", "email address", "body", "unsub_link"]
		]
	for( i = 0; i !== i_len; i++) {
		subscriber = listEmail[ i ];

		const { email, _id } = subscriber;

		const userCodeUrl = ( _id ? _id.toHexString() : _id );

		if ( !email || !userCodeUrl ) {
			continue;
		}

		let unsub_link =  BASE_URL + "/subs/remove/" + userCodeUrl
		subsArray.push( [subject, email, mailingBody, unsub_link] )
	}

	return subsArray

}
