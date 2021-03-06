const { Observable, Subject, of, from, fromEvent } = require('rxjs');
const { create, concat, map, takeUntil } = require('rxjs/operators');
const readline = require('readline');
const scheduler = require('node-schedule');
const testEtl = require('./Etl');
const extract = require('./extractors/extract');
const load = require('./loaders/load'); 
const JSONStream = require('JSONStream');
const csv = require('csv-parser');
const express = require('express');
const path = require('path');
const fs = require('file-system');
const etl = require('etl');
const sgEmail = require('@sendgrid/mail');
const client = require('twilio')(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);
const mongodb = require('mongodb');
const pg = require('pg');
const copyFrom = require('pg-copy-streams').from;
let pgClient = new pg.Client('postgres://pssshksz:Wh0grf6b-steQ88Dl0EIqk06siRpayld@pellefant.db.elephantsql.com:5432/pssshksz?ssl=true')
pgClient.connect();
const MongoClient = mongodb.MongoClient;
const Collection = mongodb.Collection;
let collection;
let csvCollection;
let jsonCollection;
MongoClient.connect('mongodb://dbadmin:admin1234@ds157549.mlab.com:57549/npm-etl-test', (err, db) => {
	csvCollection = db.collection("csvCollection");
	jsonCollection = db.collection("jsonCollection");
})
const app = express();
const PORT = 3000;

const chooseMockFile = (req, res, next) => {
	res.locals.filename = 'MOCK_DATA.csv';
	res.locals.type = 'csv';
	collection = csvCollection;
	return next();
};

const chooseMockFilePg = (req, res, next) => {
	res.locals.filename = 'MOCK_DATA.csv';
	res.locals.type = 'csv';
	return next();
};

const chooseTestFile = (req, res, next) => {
	res.locals.filename = 'test.csv';
	return next();
};

const extractCsv = (sourceType, file) => {
	return Observable.create(observer => {
		let file$; 
		if (sourceType === 'csv') file$ = fs.createReadStream(file).pipe(csv());
		if (sourceType === 'json') file$ = file;

		file$.on('data', chunk => observer.next(chunk));
		file$.on('end', () => observer.complete());

		// close the stream 
		return () => file$.pause();
	});
};

// returns an observable
const transformObservable = (fileReader$, ...transformFunc) => {
	for (let i = 0; i < transformFunc.length; i += 1) {
		fileReader$ = fileReader$.pipe(map(data => transformFunc[i](data)));
	}
	return fileReader$;
};

const storeInMongo = (data) => {
	return collection.insertOne(data);
};

const storeInPg = (data) => {
	// const query = 'INSERT INTO test ("full_name", "email_address", "password", "phone", "street_address", "city", "postal_code", "country") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)';
	// const values = [data['full_name'], data['email_address'], data['password'], data['phone'], data['street_address'], data['city'], data['postal_code'], data['country']];
	// return pgClient.query(query, values);
	return pgClient.query(copyFrom('COPY test (id, first_name, last_name, email_address, password, phone, street_address, city, postal_code, country) FROM STDIN CSV HEADER'));
};

// returns changed entry
const combineNames = (data) => {
	const nd = {};
	nd.id = data.id * 1;
	nd.full_name = data["first_name"] + ' ' + data["last_name"];
	nd.email_address = data.email_address;
	nd.password = data.password;
	nd.phone = data.phone.replace(/[^0-9]/g, ''); 
	nd.street_address = data.street_address;
	nd.city = data.city;
	nd.postal_code = data.postal_code;
	nd.country = data.country;
	nd["__line"] = (data.id * 1) + 1;
	return nd;
};

const jsonToCsv = (req, res, next) => {
	res.locals.filename = fs.createReadStream('MOCK_DATA.json', { flags: 'r', encoding: 'utf-8' }).pipe(JSONStream.parse('*'));
	res.locals.type = 'json';	
	collection = jsonCollection;
	return next();
};

const csvToMongo = async (req, res, next) => {
	const fileReader$ = extractCsv(res.locals.type, res.locals.filename);
	res.locals.data = transformObservable(fileReader$, combineNames, storeInMongo);
	return next();
};

const csvToPg = (req, res, next) => {
	const fileReader$ = extractCsv(res.locals.type, res.locals.filename);
	res.locals.data = transformObservable(fileReader$, combineNames).pipe(storeInPg);
	return next();
};

app.get('/csvToMongo', chooseMockFile, csvToMongo, (req, res) => {
	res.locals.data.subscribe();
	res.sendStatus(200);
});

app.get('/jsonToMongo', jsonToCsv, csvToMongo, (req, res) => {
	res.locals.data.subscribe();
	res.sendStatus(200);
});

app.get('/csvToPg', chooseMockFilePg, csvToPg, (req, res) => {
	res.locals.data.subscribe();
	res.sendStatus(200);
});

app.get('/etlPg', (req, res) => {
	const stream = pgClient.query(copyFrom('COPY test (id, first_name, last_name, email_address, password, phone, street_address, city, postal_code, country) FROM STDIN CSV HEADER'));
	const fileStream = fs.createReadStream('test.csv');
	fileStream.pipe(stream);
	res.sendStatus(200);
});

app.get('/test', (req, res) => {

	const filePath = '/Users/tkachler/Desktop';
	const fileName = 'output.xml';

	const emailMessage = {
		to: 'jaelee213@gmail.com',
		from: 'kachler@gmail.com',
		subject: 'Your second job has completed',
		text: 'Your RX-ETL job has finished.',
		html: '<strong>and easy to do anywhere, even with Node.js</strong>',
	};

	const textMessage = {
		to: '6193095463',
		body: 'Your second job has finished.',
	}

	const email = {
		to: 'jaelee213@gmail.com',
		from: 'kachler@gmail.com',
		subject: 'First job has finished',
		text: 'Your RX-ETL job has finished.',
		html: '<strong>and easy to do anywhere, even with Node.js</strong>',
	};

	const text = {
		to: '6193095463',
		body: 'Your first job has finished',
	}

// 	let job = new testEtl()
// 	.simple('MOCK_DATA_SHORT.csv', null, [function (data) {return data}], './', 'pleasework.csv')
// 	.combine()

// 	const emailCheck = true;
// 	const textCheck = true;

// if (emailCheck) job.addEmailNotification({
// 	to: 'jaelee213@gmail.com',
// 	from: 'rxjs-etl@gmail.com',
// 	subject: 'Your job has been completed',
// 	text: 'Your job has finished.',
// 	html: '<strong>and easy to do anywhere, even with Node.js</strong>',
// });

// if (textCheck) job.addTextNotification({
// 	to: '6267278584',
// 	body: 'Your job has finished.',
// });

// //subscribe manually
// job.observable$.subscribe(
// 	null,
// 	(err) => event.sender.send('error', err),
// 	() => {
// 		console.log('done!!!!!')
// 		if (emailCheck) {
// 			sgEmail.setApiKey(process.env.SENDGRID_API_KEY);
// 			sgEmail.send(job.email);
// 		}
// 		if (textCheck) {
// 			client.messages.create({
// 				from: process.env.TWILIO_PHONE_NUMBER,
// 				to: job.text.to,
// 				body: job.text.body,
// 			});
// 		}
// 		// event.sender.send('done', 'success')
// 	},
// );



	const test2 = new testEtl()
		.addExtractors(extract.fromJSON, 'idontexist.json')
		.addTransformers([combineNames])
		.addLoaders(load.toXML, 'iexist.xml')
		.combine()		
		.addEmailNotification(emailMessage)
		.addTextNotification(textMessage)

	const test1 = new testEtl()
		.addExtractors(extract.fromCSV, 'MOCK_DATA_SHORT.csv')
		.addTransformers([function (data) { return data }])
		.addLoaders(load.toJSON, 'idontexist.json')
		.combine()
		.addEmailNotification(email)
		.addTextNotification(text)
		.addSchedule('5 * * * * *')
		.next(test2)
		.start()

		// Testing fromMongo => toXML test
		// new testEtl()
	  // // .addExtractors(extract.fromCSV, '/Users/tkachler/Development/team-velocirabbit/rx-etl-1/MOCK_DATA.csv')
		// .addExtractors(extract.fromMongoDB, 'mongodb://dbadmin:admin1234@ds157549.mlab.com:57549/npm-etl-test', 'pleasework')
		// .addTransformers(combineNames)
		// .addLoaders(load.toXML, fileName, filePath)
		// // .addLoaders(load.toMongoDB, 'mongodb://dbadmin:admin1234@ds157549.mlab.com:57549/npm-etl-test', 'pleasework')
		// .combine()																										
		// .start()



	// const etl = new testEtl()
	// 	.simple('MOCK_DATA.csv', [combineNames], __dirname, 'pleasework.csv')
	// 	.combine()
	// 	.start()

	res.sendStatus(200);
});

app.listen(`${PORT}`, () => {
  console.log(`Server listening on PORT: ${PORT}`);
});