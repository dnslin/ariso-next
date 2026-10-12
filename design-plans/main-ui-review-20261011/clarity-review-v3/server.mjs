import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const output = resolve('.data/clarity-review-v3/dist');
const assets = {
  '/samples/forest.jpg': resolve(
    'design-plans/issue179-review-v2/public/sample-photo.jpg',
  ),
  '/samples/mountain.jpg': resolve(
    'design-plans/issue179-review-v2/public/sample-photo-2.jpg',
  ),
};
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file =
    assets[pathname] ||
    (pathname.startsWith('/fonts/') || pathname.startsWith('/shell/')
      ? resolve(`public${pathname}`)
      : resolve(
          output,
          ['/main.js', '/style.css'].includes(pathname)
            ? pathname.slice(1)
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
    console.error(pathname, error.message);
  }
}).listen(61512, '127.0.0.1', () =>
  console.log('Prototype http://127.0.0.1:61512/shares/testr'),
);
