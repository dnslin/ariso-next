import { startServer } from '../../../src/server/startup/server-start.ts';
import { requireOwner } from '../../../src/server/identity/owner.ts';

const runtime = startServer();
try {
  const { url, method, headers } = JSON.parse(process.argv[2]);
  try {
    const user = await requireOwner(new Request(url, { method, headers }));
    console.log(JSON.stringify({ user }));
  } catch (error) {
    if (!(error instanceof Error) || !('status' in error) || !('code' in error))
      throw error;
    console.log(JSON.stringify({ status: error.status, code: error.code }));
  }
} finally {
  runtime.connection.close();
}
