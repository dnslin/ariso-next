import { join } from 'node:path';
import { getAuth } from '../../../src/server/identity/auth.ts';
import { verifyUploadToken } from '../../../src/server/identity/tokens.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { parseRuntimeEnv } from '../../../src/server/runtime/env.ts';
import { captureGithubSettings } from '../../../src/server/identity/github-settings.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';

const config = parseRuntimeEnv();
const connection = openRuntimeDatabase(join(config.dataDir, 'ariso.db'));
try {
  const { url, method, headers } = JSON.parse(process.argv[2]);
  const result = await verifyUploadToken(
    new Request(url, { method, headers }),
    getAuth({
      config,
      connection,
      github: captureGithubSettings(
        connection.db,
        createSecretCrypto(config.encryptionKey),
      ),
    }),
  );
  console.log(`TOKEN_RESULT ${JSON.stringify(result)}`);
} finally {
  connection.close();
}
