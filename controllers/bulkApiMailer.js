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


const bulkQueDemo = new Queue('bulk-demo', redisConf);
exports.bulkQueDemo = bulkQueDemo;

bulkQueDemo.process( async (job) => {
  try {
	console.log( "bulkQueDemo.process ")
    const response = await fetch("google.ca");

	if (!response.ok) {
	  throw new Error(`HTTP Error: ${response.status}`);
	}

	const data = await response.json();
	return data;

  } catch (error) {
    if (error.message.includes('HTTP Error: 4')) {
      throw new Error('Retryable error'); // Ensures Bull retries
    }
  }
})

exports.retryJobs = async ( req, res, next ) => {
	// Add a job with retry and exponential backoff settings
	bulkQueDemo.add(
	  //{ url: 'http://localhost:8080/fail' },
		{},
	  {
		attempts: 3, // Maximum number of retries
		backoff: {
		  type: 'fixed', // Use exponential backoff
		  delay: 2000 // Initial delay of 1 second (doubles each retry)
		},
		removeOnComplete: 5, 
		removeOnFail: 5,
	  }
	);

	res.redirect("http://canada.ca");
}


// Listen for failures
bulkQueDemo.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed: ${err.message}`);
});
