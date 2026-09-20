import { openHttpFixture } from '../fixture.ts';

const state = globalThis as typeof globalThis & {
  identityExperiment?: ReturnType<typeof openHttpFixture>;
};
export function getAuth() {
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
