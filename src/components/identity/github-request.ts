import { z } from 'zod';
import { accountRequest } from './account-request';

const configuration = z.object({
  enabled: z.boolean(),
  clientId: z.string(),
  hasSecret: z.boolean(),
});
const settings = z.object({
  saved: configuration,
  effective: configuration,
  pendingRestart: z.boolean(),
  callbackUrl: z.url(),
});
const binding = z.object({
  binding: z
    .object({ accountId: z.string().min(1), login: z.string().nullable() })
    .nullable(),
});

export type GithubSettings = z.infer<typeof settings>;
export type GithubBinding = z.infer<typeof binding>['binding'];
export type GithubSettingsInput = {
  enabled?: boolean;
  clientId?: string;
  clientSecret?: string | null;
};

export async function readGithubSettings(signal?: AbortSignal) {
  return settings.parse(
    await accountRequest('/api/settings/github', { signal }),
  );
}

export async function saveGithubSettings(input: GithubSettingsInput) {
  return settings.parse(
    await accountRequest('/api/settings/github', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function readGithubBinding(signal?: AbortSignal) {
  return binding.parse(await accountRequest('/api/account/github', { signal }))
    .binding;
}

export async function unlinkGithub() {
  z.object({ binding: z.null() }).parse(
    await accountRequest('/api/account/github', { method: 'DELETE' }),
  );
}

export async function linkGithub() {
  const result = z
    .object({ url: z.url() })
    .parse(
      await accountRequest('/api/account/github/link', { method: 'POST' }),
    );
  return result.url;
}

export async function signInGithub(origin: string, returnTo: string) {
  const errorURL = new URL('/login', origin);
  errorURL.searchParams.set('github', 'error');
  errorURL.searchParams.set('returnTo', returnTo);
  const result = z.object({ url: z.url() }).parse(
    await accountRequest('/api/auth/sign-in/social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'github',
        callbackURL: new URL(returnTo, origin).href,
        errorCallbackURL: errorURL.href,
        disableRedirect: true,
      }),
    }),
  );
  return result.url;
}
