/**
 * Runtime test fixtures
 */

'use strict';

const http = require('http');

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

async function startJsonServer(handler) {
  const server = http.createServer(async (req, res) => {
    try {
      const body = await readRequestBody(req);
      const result = await handler({ req, body });
      const status = result?.status || 200;
      const headers = result?.headers || {};
      const payload = result?.json;

      res.writeHead(status, {
        'content-type': 'application/json',
        ...headers,
      });
      res.end(payload === undefined ? '' : JSON.stringify(payload));
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

module.exports = {
  startJsonServer,
};
