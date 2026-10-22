import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/**
 * Called by the normal browser runner; owns and cleans only its disposable app.
 * @param {{runBrowser: (script: string, config: Record<string, unknown>, logName: string) => Promise<void>, signal: AbortSignal, spaceId: number, pageLabel?: string, output: string, secrets: string[]}} options
 */
export async function runAccessProtectionBrowser({
  runBrowser,
  signal,
  spaceId,
  pageLabel,
  output,
  secrets,
}) {
  signal.throwIfAborted();
  const { launchAccessProtectionBrowserFixture } =
    await import('../e2e/access-protection-fixture.ts');
  const fixture = await launchAccessProtectionBrowserFixture();
  try {
    signal.throwIfAborted();
    secrets.push(
      fixture.browserInput.credentials.password,
      fixture.browserInput.ownerCookie,
      fixture.browserInput.shareToken,
      fixture.browserInput.imageShareToken,
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
  } finally {
    await fixture.close();
  }
}
