import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const directory = resolve(
  'design-plans/main-ui-review-20261011/interaction-review-v2',
);
const log = openSync(`${directory}/server.log`, 'a');
const child = spawn(process.execPath, [`${directory}/server.mjs`], {
  cwd: process.cwd(),
  detached: true,
  stdio: ['ignore', log, log],
});
child.unref();
await writeFile(`${directory}/server.pid`, String(child.pid));
console.log(`Prototype server started: ${child.pid}`);
