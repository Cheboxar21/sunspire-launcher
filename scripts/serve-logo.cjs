const http = require('http');
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'assets', 'logo.png');

http
  .createServer((req, res) => {
    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(500, { 'Access-Control-Allow-Origin': '*' });
        res.end('logo missing');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': data.length,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      });
      res.end(data);
    });
  })
  .listen(5174, '127.0.0.1', () => console.log('logo server on 5174'));
