const http = require('http');

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/models',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer test',
    'X-Tenant': 'fyntrac-test' // or whatever tenant
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.end();
