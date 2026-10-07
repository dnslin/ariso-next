import { expect, it, vi, afterEach } from 'vitest';
import {
  githubSettingsDraftErrors,
  githubSettingsDraftInput,
  type GithubSettingsDraft,
} from '../../../src/components/identity/github-settings-draft';
import { saveGithubSettings } from '../../../src/components/identity/github-request';

const draft: GithubSettingsDraft = {
  enabled: false,
  clientId: ' public-client ',
  clientSecret: '',
  clearSecret: false,
};
afterEach(() => vi.unstubAllGlobals());

it('omits blank Secret so a normal form save preserves the saved credential', async () => {
  const fetcher = vi.fn(async () =>
    Response.json({
      saved: { enabled: false, clientId: 'public-client', hasSecret: true },
      effective: { enabled: false, clientId: '', hasSecret: false },
      pendingRestart: true,
      callbackUrl: 'https://photos.example.test/api/auth/callback/github',
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  await saveGithubSettings(githubSettingsDraftInput(draft));
  const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(JSON.parse(String(init.body))).toEqual({
    enabled: false,
    clientId: 'public-client',
  });
});

it('sends explicit clearing only from the confirmed clear draft', () => {
  expect(githubSettingsDraftInput({ ...draft, clearSecret: true })).toEqual({
    enabled: false,
    clientId: 'public-client',
    clientSecret: null,
  });
  expect(
    githubSettingsDraftInput({ ...draft, clientSecret: ' replacement ' }),
  ).toEqual({
    enabled: false,
    clientId: 'public-client',
    clientSecret: ' replacement ',
  });
});

it('requires complete credentials when enabling, while blank Secret can preserve an existing one', () => {
  expect(
    githubSettingsDraftErrors({ ...draft, enabled: true, clientId: '' }, false),
  ).toEqual({
    clientId: '请输入 Client ID',
    clientSecret: '请输入 Client Secret',
  });
  expect(githubSettingsDraftErrors({ ...draft, enabled: true }, true)).toEqual(
    {},
  );
  expect(
    githubSettingsDraftErrors(
      { ...draft, enabled: true, clearSecret: true },
      true,
    ),
  ).toEqual({ clientSecret: '请输入 Client Secret' });
});

it('uses existing schema rules instead of submitting a mask as a replacement credential', () => {
  expect(
    githubSettingsDraftErrors({ ...draft, clientSecret: '••••' }, true),
  ).toEqual({ clientSecret: '不能把密钥占位符作为新密钥' });
  expect(
    githubSettingsDraftErrors({ ...draft, clientId: 'x'.repeat(257) }, true),
  ).toEqual({ clientId: 'Client ID 最多 256 个字符' });
});
