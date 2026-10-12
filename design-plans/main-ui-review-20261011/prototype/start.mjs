import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve('.data/main-ui-review-20261011');
await mkdir(directory, { recursive: true });
const log = openSync(resolve(directory, 'server.log'), 'a');
const child = spawn(
  process.execPath,
  ['design-plans/main-ui-review-20261011/prototype/server.mjs'],
  { cwd: process.cwd(), detached: true, stdio: ['ignore', log, log] },
);
child.unref();
await writeFile(resolve(directory, 'server.pid'), String(child.pid));
console.log(`Prototype server started: ${child.pid}`);
