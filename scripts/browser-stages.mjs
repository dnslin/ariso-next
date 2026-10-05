/** Record every independent stage while letting a lost browser stop the run. */
export async function runBrowserStage(
  stages,
  name,
  operation,
  recover,
  dependencies = [],
) {
  const blockedBy = dependencies.filter(
    (dependency) => stages[dependency]?.status !== 'passed',
  );
  if (blockedBy.length) {
    stages[name] = { status: 'blocked', blockedBy };
    return false;
  }
  try {
    await operation();
    stages[name] = { status: 'passed' };
    return true;
  } catch (error) {
    stages[name] = { status: 'failed', error: error.stack ?? String(error) };
    await recover(error, name);
    return false;
  }
}
