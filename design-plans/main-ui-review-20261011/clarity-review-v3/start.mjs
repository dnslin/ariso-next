import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const directory = resolve(
  'design-plans/main-ui-review-20261011/clarity-review-v3',
);
const runtime = resolve('.data/clarity-review-v3');
await mkdir(runtime, { recursive: true });
const log = openSync(`${runtime}/server.log`, 'a');
const child = spawn(process.execPath, [`${directory}/server.mjs`], {
  cwd: process.cwd(),
  detached: true,
  stdio: ['ignore', log, log],
});
child.unref();
await writeFile(`${runtime}/server.pid`, String(child.pid));
console.log(`Prototype server started: ${child.pid}`);
