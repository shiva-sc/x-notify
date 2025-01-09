const fetch = require('node-fetch');
const mailingManager = require('./mailing');
const mailSend = require("../helpers/mailSend");
const { bulkQueue } = require("../notifyQueue");

const BASE_URL = process.env.BASE_URL || "https://apps.canada.ca/x-notify";
const bulkAPI = "https://api.notification.canada.ca/v2/notifications/bulk";
const BULK_GC_NOTIFY_PREPEND = process.env.BULK_GC_NOTIFY_PREPEND || "ApiKey-v1 ";
const BULK_Q_ATTEMPTS = parseInt(process.env.BULK_Q_ATTEMPTS) || 20;
const BULK_Q_TYPE = process.env.BULK_Q_TYPE || "exponential";
const BULK_Q_DELAY = parseInt(process.env.BULK_Q_DELAY) || 300000; // 5 min

// Process jobs
bulkQueue.process(async (job) => {
	try {
		let mailingState = mailingManager.mailingState;
		let jobData = job.data;

		// Making the Bulk API POST request
		let response = await fetch(bulkAPI, {
		  method: 'POST',
		  headers: {
			'Content-Type': 'application/json',
			"Authorization" : BULK_GC_NOTIFY_PREPEND + jobData.notifyKey
		  },
		  body: JSON.stringify( jobData.bulkEmailBody ),
		}).then(response => {
			if (!response.ok) {
				throw new Error(`HTTP Error Status: ${response.status}`);
			}
			return response.json();
		})
		.then( result => {
			mailingManager.mailingUpdate( jobData.mailingId, mailingState.sent, { historyState: mailingState.sending } );
		})

	} catch (error) {
		if (error.message.includes('HTTP Error Status: 5')) {
		  throw new Error('Retryable error'); // Ensures Bull retries
		}
	}
});

// Listen for failures
bulkQueue.on('failed', (job, err) => {
  console.error(` bulkQueue Job ${job.id} failed: ${err.message}`);
});

exports.sendBulkEmails = async ( mailingId, topicId, subject, mailingBody ) => {
	try {
		let mailing_name = "Bulk_email-" + topicId;
		let mailingTopic = await mailingManager.getTopic( topicId );

		if ( !mailingTopic ) {
			console.log( " Bulkmailer -- sendBulkEmails: no mailingTopic found with: " +  topicId);
			throw new Error( "Bulkmailer sendBulkEmails: no mailingTopic found with: " +  topicId );
		}

		if ( !mailingTopic.nTemplateMailingId || !mailingTopic.notifyKey ) {
			console.log( " Bulkmailer -- sendBulkEmails: check mailingTopic details with topicId: " + topicId );
			throw new Error( "Bulkmailer -- sendBulkEmails: check mailingTopic details with topicId: " +  topicId );
		}

		let subscribers = await mailSend.getConfirmedSubscriberAsArray( topicId );
		if ( !subscribers.length) {
			console.log( " Bulkmailer -- sendBulkEmails : No subscribers found for the topic: " + topicId );
			throw new Error( "Bulkmailer -- sendBulkEmails: No subscribers found for the topic: " +  topicId );
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
			attempts: BULK_Q_ATTEMPTS, // Maximum number of retries
			backoff: {
			  type: 'BULK_Q_TYPE', // Use exponential backoff or fixed
			  delay: BULK_Q_DELAY // Initial delay of 1 second (doubles each retry)
			}
		}
		);
	} catch (err) { 
		console.log( 'sendBulkEmails error: ')
		console.log( err )
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
