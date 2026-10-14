import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const runtime = resolve('.data/uiux-p1-prototype');
await mkdir(runtime, { recursive: true });
const child = spawn(
  process.execPath,
  [resolve('design-plans/uiux-review-20261013/p1-prototype/server.mjs')],
  {
    cwd: process.cwd(),
    detached: true,
    stdio: [
      'ignore',
      openSync(`${runtime}/server.log`, 'a'),
      openSync(`${runtime}/server.log`, 'a'),
    ],
  },
);
child.unref();
await writeFile(`${runtime}/server.pid`, String(child.pid));
console.log(`Prototype server started: ${child.pid}`);
