import { parentPort, workerData } from 'node:worker_threads';
import { performBackupWork } from '../server/backup/work.ts';
import type {
  BackupWorkerInput,
  BackupWorkerMessage,
} from '../server/backup/worker-protocol.ts';

if (!parentPort) throw new Error('The backup worker requires a parent process');
const port = parentPort;
const controller = new AbortController();
port.on('message', (message: { type: string }) => {
  if (message.type === 'cancel')
    controller.abort(new Error('Backup task cancelled'));
});
const send = (message: BackupWorkerMessage) => port.postMessage(message);
try {
  const result = await performBackupWork(
    workerData as BackupWorkerInput,
    controller.signal,
    send,
  );
  send({ type: 'complete', result });
} catch (error) {
  send({
    type: 'error',
    code:
      error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : 'BACKUP_OPERATION_FAILED',
    message: error instanceof Error ? error.message : 'Backup worker failed',
  });
} finally {
  port.close();
}
