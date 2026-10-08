import { afterEach, expect, it, vi } from 'vitest';
import {
  readSmtpSettings,
  saveSmtpSettings,
  testSmtpSettings,
  SmtpRequestError,
} from '../../../src/components/identity/smtp-request.ts';
import {
  smtpDraft,
  smtpDraftInput,
  smtpDraftChanged,
  smtpDraftMatches,
} from '../../../src/components/identity/smtp-draft.ts';

const saved = {
  host: 'smtp.internal',
  port: 587,
  mode: 'starttls' as const,
  username: 'owner',
  fromName: 'Ariso',
  fromEmail: 'owner@example.com',
  hasPassword: true,
  updatedAt: '2026-10-08T00:00:00Z',
};
afterEach(() => vi.unstubAllGlobals());
it('normalizes sender email like the server when reconciling a lost save response', () => {
  const draft = { ...smtpDraft(saved), fromEmail: ' Owner@Example.COM ' };
  expect(smtpDraftInput(draft).fromEmail).toBe(saved.fromEmail);
  expect(smtpDraftMatches(draft, saved)).toBe(true);
  expect(smtpDraftChanged(draft, saved)).toBe(false);
});
it('reads missing configuration distinctly and never initializes a password from saved status', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(null)));
  expect(await readSmtpSettings()).toBeNull();
  expect(smtpDraft(saved).password).toBe('');
  expect(smtpDraftChanged(smtpDraft(saved), saved)).toBe(false);
});
it('omits blank passwords, preserves exact new password bytes, and sends only explicit clear when requested', async () => {
  const fetcher = vi.fn().mockImplementation(async () => Response.json(saved));
  vi.stubGlobal('fetch', fetcher);
  const draft = smtpDraft(saved);
  await saveSmtpSettings(smtpDraftInput(draft));
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).not.toHaveProperty(
    'password',
  );
  draft.password = ' new password ';
  await saveSmtpSettings(smtpDraftInput(draft));
  expect(JSON.parse(fetcher.mock.calls[1][1].body).password).toBe(
    ' new password ',
  );
  await saveSmtpSettings({ clearCredentials: true });
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({
    clearCredentials: true,
  });
});
it('keeps DATA delivery uncertainty separate from a connection-stage failure', async () => {
  const diagnostic = {
    stage: 'connection',
    code: 'ECONNECTION',
    command: 'CONN',
    delivery: 'unknown',
  };
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json(
        { message: '连接中断', code: 'SMTP_SEND_FAILED', diagnostic },
        { status: 502 },
      ),
    );
  vi.stubGlobal('fetch', fetcher);
  try {
    await testSmtpSettings();
    throw new Error('expected failure');
  } catch (error) {
    expect(error).toBeInstanceOf(SmtpRequestError);
    expect((error as SmtpRequestError).diagnostic).toEqual(diagnostic);
  }
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'POST' });
  expect(fetcher.mock.calls[0][1]).not.toHaveProperty('body');
});
it('rejects unreadable success instead of reporting that a send or save was confirmed', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(Response.json({ accepted: ['owner@example.com'] })),
  );
  await expect(testSmtpSettings()).rejects.toThrow();
});
