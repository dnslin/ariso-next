import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { z } from 'zod';
import type { createSecretCrypto } from '../runtime/crypto.ts';
import { requireSiteSettings } from '../site/settings.ts';
import { AccountError } from './errors.ts';
import { githubSettings } from './schema.ts';
import type { githubSettingsInputSchema } from './validation.ts';

type SecretCrypto = ReturnType<typeof createSecretCrypto>;
export type GithubSnapshot = {
  enabled: boolean;
  clientId: string;
  clientSecret: string | null;
};

function savedGithubSettings(db: BetterSQLite3Database) {
  return db.select().from(githubSettings).where(eq(githubSettings.id, 1)).get();
}

/** 调用方在 Web 启动时捕获；包括停用配置的秘密，不能等到首次请求再读取。 */
export function captureGithubSettings(
  db: BetterSQLite3Database,
  crypto: SecretCrypto,
): GithubSnapshot {
  const saved = savedGithubSettings(db);
  const snapshot = {
    enabled: saved?.enabled ?? false,
    clientId: saved?.clientId ?? '',
    clientSecret:
      saved && saved.clientSecretEncrypted !== null
        ? crypto.decryptSecret(
            saved.clientSecretEncrypted,
            'identity/github/clientSecret',
          )
        : null,
  };
  if (snapshot.enabled && (!snapshot.clientId || !snapshot.clientSecret))
    throw new Error(
      'identity/github: 已启用配置缺少 Client ID 或 Client Secret',
    );
  return snapshot;
}

function publicSnapshot(snapshot: GithubSnapshot) {
  return {
    enabled: snapshot.enabled,
    clientId: snapshot.clientId,
    hasSecret: snapshot.clientSecret !== null,
  };
}

export function readGithubSettings(
  db: BetterSQLite3Database,
  crypto: SecretCrypto,
  effective: GithubSnapshot,
) {
  const saved = captureGithubSettings(db, crypto);
  const publicUrl = requireSiteSettings(db).publicUrl;
  return {
    saved: publicSnapshot(saved),
    effective: publicSnapshot(effective),
    pendingRestart:
      saved.enabled !== effective.enabled ||
      saved.clientId !== effective.clientId ||
      saved.clientSecret !== effective.clientSecret,
    callbackUrl: `${publicUrl}/api/auth/callback/github`,
  };
}

export function updateGithubSettings(
  db: BetterSQLite3Database,
  crypto: SecretCrypto,
  effective: GithubSnapshot,
  input: z.infer<typeof githubSettingsInputSchema>,
) {
  db.transaction(
    (tx) => {
      const current = savedGithubSettings(tx);
      const enabled = input.enabled ?? current?.enabled ?? false;
      const clientId = input.clientId ?? current?.clientId ?? '';
      const clientSecretEncrypted =
        input.clientSecret === undefined
          ? (current?.clientSecretEncrypted ?? null)
          : input.clientSecret === null
            ? null
            : crypto.encryptSecret(input.clientSecret);
      if (enabled && (!clientId || !clientSecretEncrypted))
        throw new AccountError(
          'GITHUB_CONFIGURATION_INCOMPLETE',
          400,
          '启用 GitHub 登录需要 Client ID 和 Client Secret；清除密钥时请同时停用',
          [
            ...(!clientId
              ? [{ field: 'clientId', message: '请输入 Client ID' }]
              : []),
            ...(!clientSecretEncrypted
              ? [{ field: 'clientSecret', message: '请输入 Client Secret' }]
              : []),
          ],
        );
      tx.insert(githubSettings)
        .values({
          id: 1,
          enabled,
          clientId,
          clientSecretEncrypted,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: githubSettings.id,
          set: {
            enabled,
            clientId,
            clientSecretEncrypted,
            updatedAt: new Date(),
          },
        })
        .run();
    },
    { behavior: 'immediate' },
  );
  return readGithubSettings(db, crypto, effective);
}
