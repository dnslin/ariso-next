// Token-only transport faults preserve actual HTTP writes. Each scenario owns
// its installation and releases gates/restores fetch from finally.
async function install(page, initialize, argument = null, reload = false) {
  let identifier;
  if (reload) {
    ({ identifier } = await page.cdp('Page.addScriptToEvaluateOnNewDocument', {
      source: `(${initialize.toString()})(${JSON.stringify(argument)});`,
    }));
  } else await page.evaluate(initialize, argument);
  return {
    async result() {
      try {
        await page.waitForFunction(
          () => window.__tokensFault?.observed.settled,
        );
      } catch (cause) {
        const observed = await page.evaluate(() => {
          const fault = window.__tokensFault;
          return fault
            ? { ...fault.observed, installed: window.fetch === fault.fetch }
            : { installed: false };
        });
        throw new Error(
          `Token fault did not settle: ${JSON.stringify(observed)}`,
          { cause },
        );
      }
      return page.evaluate(() => window.__tokensFault.observed);
    },
    async release() {
      await page.evaluate(() => {
        for (const release of window.__tokensFault?.releases ?? []) release();
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
          const fault = window.__tokensFault;
          if (!fault) return;
          for (const release of fault.releases) release();
          window.fetch = fault.original;
          delete window.__tokensFault;
        });
      }
    },
  };
}

export function tokensReadFault(page, hold, reload = true) {
  return install(
    page,
    (hold) => {
      const original = window.fetch;
      const state = { original, releases: [], observed: { settled: false } };
      const gate = new Promise((resolve) => state.releases.push(resolve));
      window.__tokensFault = state;
      window.fetch = async (...args) => {
        const method = (args[1]?.method ?? 'GET').toUpperCase();
        if (
          new URL(String(args[0]), location.href).pathname !==
            '/api/upload-tokens' ||
          method !== 'GET'
        )
          return original(...args);
        window.fetch = original;
        const response = await original(...args);
        state.observed = { settled: true, status: response.status };
        if (!hold)
          throw new TypeError('Verification: real token list response lost');
        await gate;
        return response;
      };
    },
    hold,
    reload,
  );
}

export function tokensWriteFault(page, path, method, options = {}) {
  return install(
    page,
    ({ path, method, lose, sent, reconcile, invalidJsonOnce }) => {
      const original = window.fetch;
      const state = {
        original,
        releases: [],
        observed: {
          requests: 0,
          reads: 0,
          settled: false,
          calls: [],
          responses: [],
        },
      };
      const gate = new Promise((resolve) => state.releases.push(resolve));
      const readGate = new Promise((resolve) => state.releases.push(resolve));
      window.__tokensFault = state;
      state.fetch = window.fetch = async (...args) => {
        const actualPath = new URL(String(args[0]), location.href).pathname;
        const actualMethod = (args[1]?.method ?? 'GET').toUpperCase();
        if (actualPath.startsWith('/api/upload-tokens'))
          state.observed.calls.push({ path: actualPath, method: actualMethod });
        if (actualPath === path && actualMethod === method) {
          state.observed.requests++;
          if (sent) {
            // A malformed first create still reaches the real HTTP handler;
            // retry sends the original form data and gets the actual response.
            const requestArgs =
              invalidJsonOnce &&
              method === 'POST' &&
              state.observed.requests === 1
                ? [args[0], { ...args[1], body: '{' }]
                : args;
            const response = await original(...requestArgs);
            const body = await response.clone().json();
            state.observed.status = response.status;
            state.observed.tokenId = body.token?.id;
            state.observed.tokenEnabled = body.token?.enabled;
            state.observed.code = body.code;
            state.observed.message = body.message;
            state.observed.fields = body.fields;
            state.observed.responses.push({
              status: response.status,
              code: body.code,
              message: body.message,
              tokenId: body.token?.id,
              tokenEnabled: body.token?.enabled,
            });
            state.observed.settled = true;
            await gate;
            if (!lose) return response;
          } else state.observed.settled = true;
          throw new TypeError('Verification: token write response unavailable');
        }
        if (
          actualPath === '/api/upload-tokens' &&
          actualMethod === 'GET' &&
          state.observed.settled
        ) {
          state.observed.reads++;
          if (reconcile === 'fail')
            throw new TypeError(
              'Verification: token reconciliation unavailable',
            );
          const response = await original(...args);
          state.observed.readStatus = response.status;
          if (reconcile === 'hold') await readGate;
          return response;
        }
        return original(...args);
      };
    },
    {
      path,
      method,
      lose: options.lose ?? false,
      sent: options.sent ?? true,
      reconcile: options.reconcile ?? null,
      invalidJsonOnce: options.invalidJsonOnce ?? false,
    },
  );
}

export function tokensExpiryFault(page) {
  return install(page, () => {
    const original = window.fetch;
    const state = { original, releases: [], observed: { settled: false } };
    const gate = new Promise((resolve) => state.releases.push(resolve));
    window.__tokensFault = state;
    window.fetch = async (...args) => {
      const path = new URL(String(args[0]), location.href).pathname;
      const response = await original(...args);
      if (path === '/api/auth/get-session') await gate;
      if (path.startsWith('/api/upload-tokens'))
        state.observed = { settled: true, status: response.status };
      return response;
    };
  });
}
