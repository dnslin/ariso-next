/** OAuth configuration must cross process restarts before it is effective. */
export async function runOAuthManagement({
  check,
  runBrowser,
  restart,
  config,
  dependencies = /** @type {string[]} */ ([]),
}) {
  const name = `oauth-${config.width ?? 'all'}`;
  const scene = (phase, required) =>
    check(
      `${name}-${phase}`,
      () =>
        runBrowser(
          '../e2e/oauth.mjs',
          { ...config, oauthPhase: phase },
          `${name}-${phase}.log`,
        ),
      required,
    );
  const before = await scene('before', dependencies);
  await check(
    `${name}-restart`,
    () => restart(config.dataDirectory),
    dependencies,
  );
  const after = await scene('after', [
    ...dependencies,
    `${name}-before`,
    `${name}-restart`,
  ]);
  await check(`${name}-enable-restart`, () => restart(config.dataDirectory), [
    ...dependencies,
    `${name}-after`,
  ]);
  const enabled = await scene('enabled', [
    ...dependencies,
    `${name}-after`,
    `${name}-enable-restart`,
  ]);
  return before && after && enabled;
}
