/** Run credential management last, clearing process-local rate limits between suites. */
export async function runIdentityManagement({
  check,
  runBrowser,
  restart,
  config,
  dependencies,
}) {
  const tokens = `tokens-${config.width}`;
  const runtime = `account-runtime-${config.width}`;
  const account = `account-${config.width}`;
  const tokensPassed = await check(
    tokens,
    () => runBrowser('../e2e/tokens.mjs', config, `${tokens}.log`),
    dependencies,
  );
  // Restart the same DATA_DIR: retain the database and session, reset HTTP buckets.
  await check(runtime, () => restart(config.dataDirectory), dependencies);
  const accountPassed = await check(
    account,
    () => runBrowser('../e2e/account.mjs', config, `${account}.log`),
    [...dependencies, runtime],
  );
  return { tokensPassed, accountPassed };
}
