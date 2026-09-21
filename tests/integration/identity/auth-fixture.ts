import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { account, user } from '../../../src/server/identity/schema.ts';
import { prepareInitialMedia } from '../../../src/server/media/settings.ts';
import { siteSettings } from '../../../src/server/site/schema.ts';

export const email = 'owner@example.test';
export const password = 'production-auth-test-password';

// Only persistence setup: the public setup workflow belongs to its own task.
export async function seedAuthOwner(
  connection: ReturnType<typeof openRuntimeDatabase>,
  origin: string,
) {
  const id = randomUUID();
  const hash = await hashPassword(password);
  connection.db.transaction((tx) => {
    prepareInitialMedia(tx);
    tx.insert(user).values({ id, name: 'Owner', email }).run();
    tx.insert(account)
      .values({
        id: randomUUID(),
        accountId: id,
        userId: id,
        providerId: 'credential',
        password: hash,
        updatedAt: new Date(),
      })
      .run();
    tx.insert(siteSettings)
      .values({
        publicUrl: origin,
        timeZone: 'Asia/Shanghai',
        updatedAt: new Date(),
      })
      .run();
  });
  return id;
}
