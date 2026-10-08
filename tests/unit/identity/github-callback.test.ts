import { expect, it } from 'vitest';
import { buildGithubCallbackUrl } from '../../../src/server/identity/github-settings.ts';

it.each([
  [
    'https://img.example.com',
    'https://img.example.com/api/auth/callback/github',
  ],
  [
    'https://img.example.com:8443',
    'https://img.example.com:8443/api/auth/callback/github',
  ],
  ['http://localhost:3195', 'http://localhost:3195/api/auth/callback/github'],
])('从已保存地址 %s 生成 GitHub 回调', (publicUrl, expected) => {
  expect(buildGithubCallbackUrl({ publicUrl })).toBe(expected);
});

it('每次使用传入的最新地址，不保留旧 origin', () => {
  const settings = { publicUrl: 'https://old.example.com' };
  expect(buildGithubCallbackUrl(settings)).toBe(
    'https://old.example.com/api/auth/callback/github',
  );
  settings.publicUrl = 'https://new.example.com:8443';
  expect(buildGithubCallbackUrl(settings)).toBe(
    'https://new.example.com:8443/api/auth/callback/github',
  );
});
