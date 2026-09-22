import { sendMessage } from 'execa';

if (process.argv[2] === 'ignore-term') {
  process.on('SIGTERM', () => process.stderr.write('SIGTERM ignored\n'));
}

// Register the handler before announcing readiness; keep the process running.
setInterval(() => {}, 60_000);
await sendMessage({ ready: true, pid: process.pid });
