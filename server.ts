// ngrok http http://localhost:8000

import express from 'express';
import next from 'next'
import { dbConnect, getSaveActionModel } from './utils/db';
const jwt = require('jsonwebtoken');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const server = express();
const port = 8000;





app.prepare().then(async () => {

    

    const db = await dbConnect()
    const SaveActionModel = getSaveActionModel() 

    // Express.js routes and middleware go here

    server.use(express.json());
    server.use(express.urlencoded({ extended: true }));
    server.listen(port, (err) => {

        if (err) throw err;

        console.log('> Ready on http://localhost:8000');

        server.post('/createWebhooks', async function (req,res){
            const scheduled = await createWebhook('appointment.scheduled',`${targetBase}/appointment/scheduled`)
            // const rescheduled = await createWebhook('appointment.rescheduled',`${target}/appointment.rescheduled`)
            // const changed = await createWebhook('appointment.changed',`${target}/appointment.changed`)
            // const canceled = await createWebhook('appointment.canceled',`${target}/appointment.canceled`)

            console.log(`created webhooks`, {scheduled,}) //rescheduled, changed, canceled},)
        })

        server.get('/get', function (req, res) {

            const options = { method: 'GET', headers: headersAcuity };

            console.log("🚀 ~ options:", options)
            
            fetch('https://acuityscheduling.com/api/v1/appointments?max=100', options)
                .then(res => res.json())
                .then(res => console.log(res))
                .catch(err => console.error(err));
        })


        server.get('/getWebhooks',async function (req,res){
            const webhooks = await listWebhooks()

            res.json(webhooks)
        })


        server.post('/appointment/:action', function (req,res){
            console.log(`webhook endpoint`, req.body.id, req.body.calendarID, req.body.appointmentTypeID, req.body.action)


        })


        // Router:
        server.get('/', function (req, res) {
            res.json({ message: 'This is a custom API route.' });


        });


        server.listen(port, () => {
            return console.log(`Express is listening at http://localhost:${port}`);
        });

        

    });

});







//coreplus

// const jwt = require('jsonwebtoken');
// const axios = require('axios');

// // API configuration
// const app_consumer_id = " < your consumer ID here > ";
// const app_consumer_secret = " < your consumer secret here > ";
// const app_access_token = " < your access token goes here > ";
// const base_url = "https://sandbox.corepluspm.com";
// const end_point = "/API/Core/v2.1/client/";
// const httpMethod = "GET";

// // obtain the uri for the endpoint I'm going to query for
// const uri = base_url + end_point;

// // set up the jwt token claims object
// const now = Math.floor(Date.now() / 1000);
// const claims = {
//     "iss": "http://mydomain.com.au",
//     "aud": "https://corepluspm.com",
//     "nbf": now,
//     "exp": now + 60, // Add 60 seconds
//     "consumerId": app_consumer_id,
//     "accessToken": app_access_token,
//     "url": uri,
//     "httpMethod": httpMethod
// };

// // create the JWT token
// const jwt_str = jwt.sign(claims, app_consumer_secret, { algorithm: 'HS256' });

// // create signing headers
// const headers = {
//     'Authorization': 'JwToken ' + jwt_str,
//     'content-type': 'application/json'
// };

// // send the request and obtain the result
// async function makeRequest() {
//     try {
//         const response = await axios({
//             method: 'get',
//             url: uri,
//             headers: headers,
//             timeout: 45000 // 45 seconds in milliseconds
//         });
        
//         // print the returned json to console
//         console.log(response.data);
//         return response.data;
//     } catch (error) {
//         console.error('Error making request:', error.message);
//         if (error.response) {
//             console.error('Response status:', error.response.status);
//             console.error('Response data:', error.response.data);
//         }
//         throw error;
//     }
// }

// // Execute the request
// makeRequest();