import { describe, expect, it } from 'vitest';
import {
  backupBrowserSecrets,
  serializeBackupBrowserReport,
} from '../../../e2e/backup-secrets.mjs';
describe('backup browser sensitive configuration', () => {
  it('includes every restore target credential and redacts plain, encoded and embedded JSON values', () => {
    const key = 'key/with+chars';
    const secret = 'secret"quote\\slash';
    const config = {
      password: 'backup-password',
      setupCode: 'setup-code',
      credentials: { password: 'owner-password' },
      restoreTargets: [
        { storageId: 'one', value: { accessKey: key, secretKey: secret } },
        {
          storageId: 'two',
          value: { accessKey: 'second-key', secretKey: 'second-secret' },
        },
      ],
    };
    const secrets = backupBrowserSecrets(config);
    expect(secrets).toEqual(
      expect.arrayContaining([
        key,
        secret,
        'second-secret',
        'owner-password',
        'setup-code',
      ]),
    );
    const report = serializeBackupBrowserReport(
      {
        error: `${key} ${secret} ${encodeURIComponent(key)}`,
        snapshot: JSON.stringify({ secret }),
        nested: { message: 'second-secret' },
        namespace: 'owned/ariso/id/',
      },
      secrets,
    );
    expect(JSON.parse(report).nested.message).toBe('[redacted]');
    expect(report).not.toContain('with+chars');
    expect(report).not.toContain('quote');
    expect(report).toContain('owned/ariso/id/');
  });
  it('keeps local-only reports working without remote configuration', () => {
    expect(
      backupBrowserSecrets({ credentials: { password: 'owner' } }),
    ).toEqual(['owner']);
    expect(
      JSON.parse(serializeBackupBrowserReport({ status: 'passed' }, [])),
    ).toEqual({ status: 'passed' });
  });
});
