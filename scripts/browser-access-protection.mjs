import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/**
 * Called by the normal browser runner; owns and cleans only its disposable app.
 * @param {{runBrowser: (script: string, config: Record<string, unknown>, logName: string) => Promise<void>, spaceId: number, pageLabel?: string, output: string, secrets?: string[], report?: {accessProtection?: string}}} options
 */
export async function runAccessProtectionBrowser({
  runBrowser,
  spaceId,
  pageLabel,
  output,
  secrets = [],
  report,
}) {
  const { launchAccessProtectionBrowserFixture } =
    await import('../e2e/access-protection-fixture.ts');
  const fixture = await launchAccessProtectionBrowserFixture();
  try {
    secrets.push(
      fixture.browserInput.credentials.password,
      fixture.browserInput.ownerCookie,
      fixture.browserInput.shareToken,
    );
    await runBrowser(
      '../e2e/access-protection.mjs',
      {
        ...fixture.browserInput,
        spaceId,
        pageLabel,
        output,
        geometryScript: pathToFileURL(resolve('e2e/browser-geometry.mjs')).href,
        errorsScript: pathToFileURL(resolve('e2e/browser-errors.mjs')).href,
        loginScript: pathToFileURL(resolve('e2e/library-login.mjs')).href,
      },
      'access-protection.log',
    );
    if (report) report.accessProtection = 'passed';
  } finally {
    await fixture.close();
  }
}
