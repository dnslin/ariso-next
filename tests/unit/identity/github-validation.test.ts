import { expect, it } from 'vitest';
import {
  githubProfileSchema,
  githubSettingsInputSchema,
} from '../../../src/server/identity/validation.ts';

it('GitHub settings distinguish omission, replacement and explicit removal without accepting masked placeholders', () => {
  expect(
    githubSettingsInputSchema.parse({ enabled: false }),
  ).not.toHaveProperty('clientSecret');
  expect(githubSettingsInputSchema.parse({ clientSecret: null })).toEqual({
    clientSecret: null,
  });
  expect(
    githubSettingsInputSchema.parse({
      clientId: ' client-id ',
      clientSecret: ' new-secret ',
    }),
  ).toEqual({ clientId: 'client-id', clientSecret: ' new-secret ' });
  for (const input of [
    { clientSecret: '' },
    { clientSecret: '••••••••' },
    { clientSecret: '******' },
    { provider: 'credential' },
    { enabled: 'true' },
  ])
    expect(githubSettingsInputSchema.safeParse(input).success).toBe(false);
});

it('provider profile only requires the stable account identity and real public login consumed by this operation', () => {
  expect(
    githubProfileSchema.parse({
      id: 181,
      login: 'ariso-owner',
      extra: 'not retained',
    }),
  ).toEqual({ id: 181, login: 'ariso-owner' });
  for (const profile of [
    { id: null, login: 'owner' },
    { id: 181 },
    { id: 181, login: '' },
  ])
    expect(githubProfileSchema.safeParse(profile).success).toBe(false);
});
