const mailingManager = require('./mailing');
const worker = require("./workerSendEmail");

exports.sendBulkEmails = async ( req, res, next ) => {
	try {
		let bulkAPI = "https://api.notification.canada.ca/v2/notifications/bulk"
		let body_template =	{
		"name": "Shiva test bulk send ",
		"template_id": "f7b24504-6aae-466d-990a-cd957801a448",
		"rows": [
			[
				"email address",
				"body",
				"unsub_link"
			],
			[
				"shiva.kayathi@servicecanada.gc.ca",
				"Hello from cens",
				"unsub_link1"
			],
			[
				"francis.gorman@hrsdc-rhdcc.gc.ca",
				"Hello from cens",
				"unsub_link2"
			],
			[
				"pierre.dubois@servicecanada.gc.ca",
				"Hello from cens",
				"unsub_link3"
			],
			[
				"shivareddy76076@gmail.com",
				"Hello from cens",
				"unsub_link4"
			]
		]
		}
		let mailingTopicID = "bulk-email-en"
		mailingBody = "Hello from cens"
		mailingTopic = await mailingManager.getTopic(mailingTopicID);
		
        subscribers = await worker.getConfirmedSubscriberAsArray(mailingTopicID);

		let subsRows = await formatSubsArray(mailingTopic, subscribers, mailingBody);

		let body = {
			"name": "Shiva test bulk send demo",
			"template_id": mailingTopic.templateId,
			"rows": subsRows
		}
		
		// Making the POST request
		fetch(bulkAPI, {
		  method: 'POST', // HTTP method
		  headers: {
			'Content-Type': 'application/json', // Specify content type
			"Authorization" : mailingTopic.notifyKey
		  },
		  body: JSON.stringify(body), // Convert data to JSON format
		})
		.then(response => {
			if (!response.ok) {
				console.log(response);
			  throw new Error(`HTTP error! Status: ${response.status}`);
			  
			}
			return response.json(); // Parse JSON response
		})
		.then(result => {
			console.log('Success:', result);
		})
		.catch(error => {
			console.error('Error:', error);
		});

	} catch (err) { 
		throw Error('sendBulkEmails error: ' + err, 502)
	}
	res.redirect( "https://canada.ca" );
}


formatSubsArray = async (mailingTopic, listEmail, mailingBody) => {

	let i, i_len = listEmail.length, subscriber;
	let subsArray = [
			["email address", "body", "unsub_link"]
		]
	for( i = 0; i !== i_len; i++) {
		subscriber = listEmail[ i ];
		
		const { email, _id } = subscriber;

		const userCodeUrl = ( _id ? _id.toHexString() : _id );

		if ( !email ) {
			continue;
		}
		
		let unsub_link =  "http://localhost:3000" + "/subs/remove/" + userCodeUrl
		subsArray.push([email, mailingBody, unsub_link])
	}

	return subsArray

}
