import { readFileSync } from 'node:fs';
import { openRuntimeDatabase } from '../../../dist/server/runtime/db.js';
import { readShareAccess } from '../../../dist/server/sharing/authorization.js';

const input = JSON.parse(readFileSync(0, 'utf8'));
const connection = openRuntimeDatabase(input.databasePath);
try {
  const access = connection.db.transaction((tx) =>
    readShareAccess(tx, {
      token: input.token,
      grantSecret: input.grantSecret,
      now: new Date(input.now),
    }),
  );
  process.stdout.write(
    JSON.stringify(
      access.allowed ? { allowed: true, shareId: access.share.id } : access,
    ),
  );
} finally {
  connection.close();
}
