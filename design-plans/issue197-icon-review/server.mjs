import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const output = resolve('.data/theme-197/icon-prototype');
const types = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.html': 'text/html; charset=utf-8',
};
createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file =
    path.startsWith('/fonts/') || path.startsWith('/shell/')
      ? resolve(`public${path}`)
      : resolve(
          output,
          ['/main.js', '/style.css'].includes(path)
            ? path.slice(1)
            : 'index.html',
        );
  try {
    res.setHeader('Content-Type', types[extname(file)]);
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}).listen(61500, '127.0.0.1', () =>
  console.log('Prototype http://127.0.0.1:61500'),
);
