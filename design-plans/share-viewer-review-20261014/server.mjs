import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import samples from './samples.json' with { type: 'json' };

const output = resolve('.data/share-viewer-prototype/dist');
const assets = Object.fromEntries(
  samples.map((photo) => [
    photo.src,
    resolve('.data/share-viewer-prototype/assets', photo.src.split('/').at(-1)),
  ]),
);
for (const name of ['caveat.woff2', 'noto-sans-sc.woff2'])
  assets[`/fonts/${name}`] = resolve('public/fonts', name);
assets['/shell/glow-desktop.svg'] = resolve('public/shell/glow-desktop.svg');
assets['/shell/glow-mobile.svg'] = resolve('public/shell/glow-mobile.svg');
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
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  const file =
    assets[pathname] ||
    {
      '/': `${output}/index.html`,
      '/main.js': `${output}/main.js`,
      '/style.css': `${output}/style.css`,
    }[pathname];
  if (!file) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  try {
    response.setHeader(
      'Content-Type',
      types[extname(file)] || 'application/octet-stream',
    );
    response.end(await readFile(file));
  } catch (error) {
    response.writeHead(500);
    response.end('Prototype asset unavailable');
    console.error(pathname, error);
  }
}).listen(61516, '127.0.0.1', () =>
  console.log('Prototype http://127.0.0.1:61516/'),
);
