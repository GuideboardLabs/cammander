const http = require('http');
const fs = require('fs');
const path = require('path');
const httpProxy = require('http-proxy');

const STATIC_PORT = 3001;
const BACKEND_PORT = 3002;
const BACKEND_HOST = '127.0.0.1';
const STATIC_DIR = '/home/sc/Documents/cammander';

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Create a proxy instance for WebSocket + HTTP API
const proxy = httpProxy.createProxyServer({
  target: { host: BACKEND_HOST, port: BACKEND_PORT },
  ws: true,
  changeOrigin: true,
});

proxy.on('error', (err, req, res) => {
  console.error('Proxy error:', err.message);
  if (res && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Backend unreachable', detail: err.message }));
  }
});

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  // Proxy /api/* and /terminal (Socket.IO) to backend
  if (req.url.startsWith('/api/') || req.url.startsWith('/terminal')) {
    // Rewrite /api/ prefix
    if (req.url.startsWith('/api/')) {
      req.url = req.url.replace('/api/', '/');
    }
    proxy.web(req, res, { target: `http://${BACKEND_HOST}:${BACKEND_PORT}` });
    return;
  }

  // Serve static files
  let filePath = path.join(STATIC_DIR, req.url === '/' ? 'prototype.html' : req.url);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(STATIC_DIR, 'prototype.html');
  }
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  });
});

// Handle WebSocket upgrades for /terminal
server.on('upgrade', (req, socket, head) => {
  if (req.url && req.url.startsWith('/terminal')) {
    proxy.ws(req, socket, head, { target: `ws://${BACKEND_HOST}:${BACKEND_PORT}` });
  } else {
    socket.destroy();
  }
});

server.listen(STATIC_PORT, '0.0.0.0', () => {
  console.log(`Proxy+static on http://0.0.0.0:${STATIC_PORT}`);
  console.log(`  /api/* -> http://${BACKEND_HOST}:${BACKEND_PORT}/*`);
  console.log(`  /terminal (WS) -> ws://${BACKEND_HOST}:${BACKEND_PORT}/terminal`);
});