import { openHttpFixture } from '../fixture.ts';
import { openGithubHttpFixture } from '../github-fixture.ts';
import type { GithubConfig } from '../github-fixture.ts';

const state = globalThis as typeof globalThis & {
  identityExperiment?: ReturnType<typeof openHttpFixture>;
  githubExperiment?: ReturnType<typeof openGithubHttpFixture>;
};
export function getGithubExperiment() {
  const {
    IDENTITY_DATABASE,
    IDENTITY_CONFIG,
    IDENTITY_GITHUB_SETTINGS,
    BETTER_AUTH_SECRET,
  } = process.env;
  if (
    !IDENTITY_DATABASE ||
    !IDENTITY_CONFIG ||
    !IDENTITY_GITHUB_SETTINGS ||
    !BETTER_AUTH_SECRET
  )
    throw new Error(
      'GitHub experiment requires database, origin, provider config and auth secret',
    );
  return (state.githubExperiment ??= openGithubHttpFixture(
    IDENTITY_DATABASE,
    IDENTITY_CONFIG,
    JSON.parse(IDENTITY_GITHUB_SETTINGS) as GithubConfig,
    BETTER_AUTH_SECRET,
  ));
}
export function getAuth() {
  if (process.env.IDENTITY_GITHUB_SETTINGS)
    return getGithubExperiment().getAuth();
  const { IDENTITY_DATABASE, IDENTITY_CONFIG, BETTER_AUTH_SECRET } =
    process.env;
  if (!IDENTITY_DATABASE || !IDENTITY_CONFIG || !BETTER_AUTH_SECRET) {
    throw new Error(
      'Identity HTTP experiment requires its database, config and secret',
    );
  }
  state.identityExperiment ??= openHttpFixture(
    IDENTITY_DATABASE,
    IDENTITY_CONFIG,
    BETTER_AUTH_SECRET,
  );
  return state.identityExperiment.getAuth();
}
