import { startServer } from '../../../src/server/startup/server-start.ts';
import { requireOwner } from '../../../src/server/identity/owner.ts';

let runtime: ReturnType<typeof startServer> | undefined;
let result: unknown;
try {
  const { url, method, headers } = JSON.parse(process.argv[2]);
  try {
    runtime = startServer();
    const user = await requireOwner(new Request(url, { method, headers }));
    result = { user };
  } catch (error) {
    if (!(error instanceof Error) || !('status' in error) || !('code' in error))
      throw error;
    result = { status: error.status, code: error.code };
  }
} finally {
  await runtime?.stop();
}
console.log(`AUTH_RESULT ${JSON.stringify(result)}`);
