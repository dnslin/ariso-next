// Faults change delivery of real HTTP responses, never invent successful writes.
export async function oauthFault(page, options) {
  const initialize = (options) => {
    const original = window.fetch;
    const state = {
      original,
      releases: [],
      observed: { requests: 0, reads: 0, settled: false },
    };
    window.__oauthFault = state;
    let consumed = false;
    const gate = new Promise((resolve) => state.releases.push(resolve));
    window.fetch = async (...args) => {
      const path = new URL(String(args[0]), location.href).pathname;
      const method = (args[1]?.method ?? 'GET').toUpperCase();
      if (path !== options.path) return original(...args);
      if (
        method === 'GET' &&
        options.failReconcile &&
        state.observed.requests
      ) {
        state.observed.reads++;
        const response = await original(...args);
        state.observed.readStatus = response.status;
        throw new TypeError('Verification: OAuth reconciliation response lost');
      }
      if (method !== options.method) return original(...args);
      state.observed.requests++;
      if (consumed) return original(...args);
      consumed = true;
      if (args[1]?.body) {
        const body = JSON.parse(args[1].body);
        state.observed.input = {
          enabled: body.enabled,
          clientId: body.clientId,
          secret: !Object.hasOwn(body, 'clientSecret')
            ? 'keep'
            : body.clientSecret === null
              ? 'clear'
              : 'replace',
        };
      }
      if (options.reject) {
        state.observed.settled = true;
        throw new TypeError('Verification: OAuth request not sent');
      }
      const response = await original(...args);
      state.observed.status = response.status;
      state.observed.settled = true;
      if (options.hold) await gate;
      if (options.lose)
        throw new TypeError('Verification: real OAuth response lost');
      return response;
    };
  };
  let identifier;
  if (options.reload)
    ({ identifier } = await page.cdp('Page.addScriptToEvaluateOnNewDocument', {
      source: `(${initialize.toString()})(${JSON.stringify(options)});`,
    }));
  else await page.evaluate(initialize, options);
  return {
    async result() {
      await page.waitForFunction(() => window.__oauthFault?.observed.settled);
      return page.evaluate(() => window.__oauthFault.observed);
    },
    async release() {
      await page.evaluate(() => {
        for (const release of window.__oauthFault?.releases ?? []) release();
      });
    },
    async dispose() {
      try {
        if (identifier)
          await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
            identifier,
          });
      } finally {
        await page.evaluate(() => {
          const fault = window.__oauthFault;
          if (!fault) return;
          for (const release of fault.releases) release();
          window.fetch = fault.original;
          delete window.__oauthFault;
        });
      }
    },
  };
}
