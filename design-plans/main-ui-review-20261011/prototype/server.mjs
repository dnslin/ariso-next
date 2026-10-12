import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const output = resolve('.data/main-ui-review-20261011/prototype');
const assets = {
  '/samples/forest.jpg': resolve(
    'design-plans/issue179-review-v2/public/sample-photo.jpg',
  ),
  '/samples/mountain.jpg': resolve(
    'design-plans/issue179-review-v2/public/sample-photo-2.jpg',
  ),
};
const types = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.html': 'text/html; charset=utf-8',
};
createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const file =
    assets[path] ||
    (path.startsWith('/fonts/') || path.startsWith('/shell/')
      ? resolve(`public${path}`)
      : resolve(
          output,
          ['/main.js', '/style.css'].includes(path)
            ? path.slice(1)
            : 'index.html',
        ));
  try {
    response.setHeader(
      'Content-Type',
      types[extname(file)] || 'application/octet-stream',
    );
    response.end(await readFile(file));
  } catch (error) {
    response.statusCode = 404;
    response.end('Not found');
    console.error(path, error.message);
  }
}).listen(61510, '127.0.0.1', () =>
  console.log('Prototype http://127.0.0.1:61510/dashboard'),
);
