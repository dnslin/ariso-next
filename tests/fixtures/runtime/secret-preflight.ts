import { sql } from 'drizzle-orm';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { runPreflight } from '../../../src/server/startup/preflight.ts';

// 仅供临时入口调用；模拟未来业务模块的普通读取函数，不扫描未知表或字段。
try {
  runPreflight(process.env, (db, config) => {
    const crypto = createSecretCrypto(config.encryptionKey);
    const rows = db.all<{ id: string; secret: string | null }>(
      sql`SELECT id, secret FROM secret_sample ORDER BY id`,
    );
    for (const row of rows) {
      if (row.secret !== null) {
        crypto.decryptSecret(row.secret, `storage/${row.id}/secretKey`);
      }
    }
    console.log('secret-preflight-complete');
  });
} catch (error) {
  console.error('prestart failed:', error);
  process.exitCode = 1;
}
