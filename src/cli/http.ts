import http from 'node:http';

// Next's standard server has no requestTimeout option. Give the upload receiver
// its 30-minute body budget plus Node's unchanged 60-second header budget.
const createServer = http.createServer;
http.createServer = ((...args: Parameters<typeof createServer>) => {
  const server = createServer(...args);
  server.requestTimeout = 1_860_000;
  return server;
}) as typeof createServer;
