import assert from 'node:assert/strict';

const binding = '__arisoReportError';

export async function installBrowserErrors(page) {
  await page.cdp('Runtime.enable');
  await page.cdp('Runtime.addBinding', { name: binding });
  const { identifier } = await page.cdp(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `(() => {
      const report = (kind, message) => window.${binding}(JSON.stringify({
        url: location.href, kind, message,
      }));
      window.addEventListener('error', event => report('error',
        event.message || 'Resource failed: ' + (event.target.src || event.target.href)
      ), true);
      window.addEventListener('unhandledrejection', event =>
        report('unhandledrejection', String(event.reason)));
      const originalError = console.error;
      console.error = (...args) => {
        report('console.error', args.map(String).join(' '));
        originalError.apply(console, args);
      };
    })();`,
    },
  );
  return identifier;
}

// Ego buffers protocol events outside the document, so navigation cannot erase
// an earlier page's errors. Each caller must assert or record every drained batch.
export async function readBrowserErrors(page) {
  return (await page.events())
    .filter(
      ({ method, params }) =>
        method === 'Runtime.bindingCalled' && params.name === binding,
    )
    .map(({ params }) => JSON.parse(params.payload));
}

export async function assertNoBrowserErrors(page) {
  const errors = await readBrowserErrors(page);
  assert.deepEqual(errors, [], 'No browser runtime or resource errors');
  return errors;
}
