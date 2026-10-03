/* global taskSpace, config */
const { identitySql } = await import(config.identitySessionScript);
const { signInToLibrary } = await import(
  new URL('./library-login.mjs', config.libraryDetailScript).href
);
const { verifyLibraryViewer } = await import(config.libraryViewerScript);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const report = { checks: [], layouts: [] };
await page.goto(`${config.origin}/library`);
await page.waitForFunction(
  () =>
    location.pathname === '/login' ||
    !!document.querySelector('[data-testid="library-list"]'),
);
if (new URL(await page.url()).pathname === '/login')
  await signInToLibrary(page, config, report);
console.log(
  await verifyLibraryViewer({
    page,
    config,
    sql: (statement) => identitySql(config, statement),
    report,
  }),
);
