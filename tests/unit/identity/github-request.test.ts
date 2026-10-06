import { afterEach, expect, it, vi } from 'vitest';
import {
  readGithubBinding,
  readGithubSettings,
  saveGithubSettings,
  unlinkGithub,
  signInGithub,
} from '../../../src/components/identity/github-request';

afterEach(() => vi.unstubAllGlobals());

const configuration = { enabled: false, clientId: '', hasSecret: false };
const response = {
  saved: { enabled: true, clientId: 'public-client-id', hasSecret: true },
  effective: configuration,
  pendingRestart: true,
  callbackUrl: 'https://photos.example.test/api/auth/callback/github',
};

it('keeps saved and effective OAuth configurations separate', async () => {
  vi.stubGlobal('fetch', async () => Response.json(response));
  await expect(readGithubSettings()).resolves.toEqual(response);
});

it('does not interpret unreadable settings as disabled OAuth', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ saved: configuration }));
  await expect(readGithubSettings()).rejects.toThrow();
});

it.each([
  [{ enabled: true }, { enabled: true }],
  [{ clientSecret: 'new-secret' }, { clientSecret: 'new-secret' }],
  [
    { enabled: false, clientSecret: null },
    { enabled: false, clientSecret: null },
  ],
])(
  'preserves secret omission, replacement and explicit clearing: %j',
  async (input, expected) => {
    const fetcher = vi.fn(async () => Response.json(response));
    vi.stubGlobal('fetch', fetcher);
    await saveGithubSettings(input);
    const init = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(init[0]).toBe('/api/settings/github');
    expect(init[1].method).toBe('PATCH');
    expect(JSON.parse(String(init[1].body))).toEqual(expected);
  },
);

it('distinguishes a real unbound account from an unreadable binding', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ binding: null }));
  await expect(readGithubBinding()).resolves.toBeNull();
  vi.stubGlobal('fetch', async () => Response.json({}));
  await expect(readGithubBinding()).rejects.toThrow();
});

it('does not report unlink success from an unexpected successful response', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ success: true }));
  await expect(unlinkGithub()).rejects.toThrow();
});

it('propagates an uncertain save for reconciliation without submitting again', async () => {
  const fetcher = vi.fn(async () => {
    throw new TypeError('lost response');
  });
  vi.stubGlobal('fetch', fetcher);
  await expect(
    saveGithubSettings({ clientSecret: 'replacement' }),
  ).rejects.toThrow('lost response');
  expect(fetcher).toHaveBeenCalledOnce();
});

it('starts GitHub login with the requested destination and a recoverable error URL', async () => {
  const fetcher = vi.fn(async () =>
    Response.json({
      url: 'https://github.com/login/oauth/authorize?state=test',
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  await expect(
    signInGithub('https://photos.example.test', '/library?album=one'),
  ).resolves.toContain('https://github.com/');
  const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(JSON.parse(String(init.body))).toEqual({
    provider: 'github',
    callbackURL: 'https://photos.example.test/library?album=one',
    errorCallbackURL:
      'https://photos.example.test/login?github=error&returnTo=%2Flibrary%3Falbum%3Done',
    disableRedirect: true,
  });
});
