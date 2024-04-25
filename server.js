const http = require('http');
const https = require('https');
const fs = require('fs');
const PORT = 7000;

// Environment variable to store XSRF token
let xsrfToken = '';

// Function to send request with retry
const sendRequestWithRetry = (requestBody, apiUrl, clientReq, clientRes) => {
    const options = {
        method: 'POST',
        headers: {
            ...clientReq.headers,
            'Content-Type': 'application/json',
            'Host': new URL(apiUrl).hostname,
            'XSRF-Token': xsrfToken

        },
        rejectUnauthorized: false
    };

    const proxyReq = https.request(apiUrl, options, (proxyRes) => {
        console.log('Received response:', proxyRes.statusCode);

        // Set CORS headers
        clientRes.setHeader('Access-Control-Allow-Origin', '*');
        clientRes.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        clientRes.setHeader('Access-Control-Allow-Headers', 'Content-Type, XSRF-Token, devIds, devTypeId, collectTime, apiUrl');

        // Save XSRF token to environment variable
        const responseXSRFToken = proxyRes.headers['xsrf-token'];
        if (responseXSRFToken) {
            xsrfToken = responseXSRFToken;
            console.log('XSRF token saved to environment:', xsrfToken);
        }

        // Set response headers
        clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);

        proxyRes.pipe(clientRes, { end: true });
    });

    proxyReq.write(requestBody);
    proxyReq.end();

    proxyReq.on('error', (error) => {
        console.error('Proxy request error:', error);
        clientRes.writeHead(500, { 'Content-Type': 'text/plain' });
        clientRes.end('Proxy request error');

        setTimeout(() => sendRequestWithRetry(requestBody, apiUrl, clientReq, clientRes), 1000);
    });
};

    // Function to retrieve data from file
    function getDataFromFile(callback) {
        fs.readFile('Client_info.js', 'utf8', (err, data) => {
            if (err) {
                console.error('Error reading file:', err);
                callback(err, null);
                return;
            }
            callback(null, data);
        });
    }

    // Function to update data in file
    function updateDataInFile(newData, callback) {
        // Read the current content of the file
        fs.readFile('Client_info.js', 'utf8', (err, data) => {
            if (err) {
                console.error('Error reading file:', err);
                callback(err);
                return;
            }

        // Find the index of the last occurrence of ']'
        const lastIndex = data.lastIndexOf(']');
        if (lastIndex !== -1) {
            // Construct the updated content with the new data appended inside the array
            const updatedData = `${data.slice(0, lastIndex)}\n,${JSON.stringify(newData)}${data.slice(lastIndex)}`;

            // Write the updated content back to the file
            fs.writeFile('Client_info.js', updatedData, err => {
                if (err) {
                    console.error('Error writing file:', err);
                    callback(err);
                    return;
                }
                console.log('Data updated in file');
                callback(null);
            });
        } else {
            console.error('Array not found in file');
            callback(new Error('Array not found in file'));
        }
    });
}

// Create a proxy server
const server = http.createServer((clientReq, clientRes) => {
    // Handle preflight requests
    if (clientReq.method === 'OPTIONS') {
        clientRes.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, XSRF-Token, DevIds, DevTypeId, CollectTime, userName, systemCode',
            'Content-Length': '0'
        });
        clientRes.end();
        return;
    }

    // Handle GET request for '/dataList'
    if (clientReq.url === '/dataList' && clientReq.method === 'GET') {
        // Retrieve data from file and send as response
        getDataFromFile((err, data) => {
            if (err) {
                clientRes.writeHead(500, { 'Content-Type': 'text/plain' });
                clientRes.end('Internal Server Error');
                return;
            }
            clientRes.writeHead(200, { 'Content-Type': 'application/json' });
            clientRes.end(data);
        });
        return;
    }

    // Handle POST request for '/addData'
    if (clientReq.url === '/addData' && clientReq.method === 'POST') {
        let requestBody = '';
        clientReq.on('data', chunk => {
            requestBody += chunk.toString();
        });
        clientReq.on('end', () => {
            // Parse the JSON data sent by the client
            const newData = JSON.parse(requestBody);
            // Update data in file with the new data
            updateDataInFile(newData, (err) => {
                if (err) {
                    clientRes.writeHead(500, { 'Content-Type': 'text/plain' });
                    clientRes.end('Internal Server Error');
                    return;
                }
                clientRes.writeHead(200, { 'Content-Type': 'text/plain' });
                clientRes.end('Data added successfully');
            });
        });
        return;
    }

    // Log the incoming request
    console.log('Received request:', clientReq.method, clientReq.url);

    // Extract data from the request body
    let requestBody = '';
    clientReq.on('data', chunk => {
        requestBody += chunk.toString();
    });

    clientReq.on('end', () => {
        try {
            // Handle empty request body
            if (!requestBody.trim()) {
                throw new Error('Empty request body');
            }

            const requestData = JSON.parse(requestBody);

            // Extract data from the request body
            const apiUrl = requestData.apiUrl || '';

            // Ensure apiUrl is valid before proceeding
            if (!apiUrl) {
                throw new Error('Missing apiUrl in request body');
            }

            // Initial request
            sendRequestWithRetry(requestBody, apiUrl, clientReq, clientRes);
        } catch (error) {
            console.error('Error parsing request body:', error);
            clientRes.writeHead(400, { 'Content-Type': 'text/plain' });
            clientRes.end('Error parsing request body: ' + error.message);

            setTimeout(() => sendRequestWithRetry(requestBody, apiUrl, clientReq, clientRes), 1000);
        }
    });
});

// Start the proxy server
server.listen(PORT, () => {
    console.log(`Proxy server is listening on port ${PORT}`);
});
