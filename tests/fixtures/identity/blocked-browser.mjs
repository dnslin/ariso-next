// Process-cancellation boundary double only: this does not verify browser behavior.
import { writeFileSync } from 'node:fs';
let source = '';
for await (const chunk of process.stdin) source += chunk;
const config = JSON.parse(source.match(/^const config = (.*);$/m)[1]);
writeFileSync(
  process.env.BROWSER_STARTED,
  JSON.stringify({ ...config, pid: process.pid }),
);
setInterval(() => {}, 1000);
