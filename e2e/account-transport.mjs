// Account-only fetch faults retain actual server responses. Every scenario
// owns one installation and releases it from finally, including failed checks.
async function install(page, initialize, argument = null, reload = false) {
  let identifier;
  if (reload) {
    ({ identifier } = await page.cdp('Page.addScriptToEvaluateOnNewDocument', {
      source: `(${initialize.toString()})(${JSON.stringify(argument)});`,
    }));
  } else await page.evaluate(initialize, argument);
  return {
    async result() {
      await page.waitForFunction(() => window.__accountFault?.observed.settled);
      return page.evaluate(() => window.__accountFault.observed);
    },
    async release() {
      await page.evaluate(() => {
        for (const release of window.__accountFault?.releases ?? []) release();
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
          const fault = window.__accountFault;
          if (!fault) return;
          for (const release of fault.releases) release();
          window.fetch = fault.original;
          delete window.__accountFault;
        });
      }
    },
  };
}

export async function observeAccountLogin(page) {
  const fault = await install(page, () => {
    const original = window.fetch;
    const state = { original, releases: [], observed: { responses: [] } };
    window.__accountFault = state;
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (
        /\/api\/auth\/(sign-in\/email|get-session)(?:\?|$)/.test(response.url)
      )
        state.observed.responses.push({
          path: new URL(response.url).pathname,
          status: response.status,
          retryAfter: Number(response.headers.get('x-retry-after')),
          receivedAt: Date.now(),
        });
      return response;
    };
  });
  return {
    dispose: fault.dispose,
    async reset() {
      await page.evaluate(() => {
        window.__accountFault.observed.responses = [];
      });
    },
    async lastFailure() {
      return page.evaluate(() =>
        window.__accountFault.observed.responses.findLast(
          (response) => response.status >= 400,
        ),
      );
    },
  };
}

export function accountReadFault(page, hold) {
  return install(
    page,
    (hold) => {
      const original = window.fetch;
      const state = { original, releases: [], observed: { settled: false } };
      const gate = new Promise((resolve) => state.releases.push(resolve));
      window.__accountFault = state;
      window.fetch = async (...args) => {
        if (new URL(String(args[0]), location.href).pathname !== '/api/account')
          return original(...args);
        window.fetch = original;
        const response = await original(...args);
        state.observed = { settled: true, status: response.status };
        if (!hold)
          throw new TypeError(
            'Verification: account read response connection lost',
          );
        await gate;
        return response;
      };
    },
    hold,
    true,
  );
}

export function accountExpiryFault(page) {
  return install(page, () => {
    const original = window.fetch;
    const state = { original, releases: [], observed: { settled: false } };
    const gate = new Promise((resolve) => state.releases.push(resolve));
    window.__accountFault = state;
    window.fetch = async (...args) => {
      const path = new URL(String(args[0]), location.href).pathname;
      const response = await original(...args);
      if (path === '/api/auth/get-session') await gate;
      if (path === '/api/account')
        state.observed = { settled: true, status: response.status };
      return response;
    };
  });
}

export function accountWriteFault(page, path, lose = false) {
  return install(
    page,
    ({ path, lose }) => {
      const original = window.fetch;
      const state = {
        original,
        releases: [],
        observed: { requests: 0, settled: false },
      };
      const gate = new Promise((resolve) => state.releases.push(resolve));
      window.__accountFault = state;
      window.fetch = async (...args) => {
        if (new URL(String(args[0]), location.href).pathname !== path)
          return original(...args);
        state.observed.requests++;
        const response = await original(...args);
        state.observed.status = response.status;
        state.observed.settled = true;
        await gate;
        window.fetch = original;
        if (lose)
          throw new TypeError(
            'Verification: account response lost after real write',
          );
        return response;
      };
    },
    { path, lose },
  );
}

export function emailReconcileFault(page, committed) {
  return install(
    page,
    (committed) => {
      const original = window.fetch;
      const state = { original, releases: [], observed: { settled: false } };
      const gate = new Promise((resolve) => state.releases.push(resolve));
      window.__accountFault = state;
      window.fetch = async (...args) => {
        const path = new URL(String(args[0]), location.href).pathname;
        if (path === '/api/account/email') {
          if (committed) await original(...args);
          throw new TypeError(
            committed
              ? 'Verification: committed email response lost'
              : 'Verification: email request not sent',
          );
        }
        if (path === '/api/account') {
          window.fetch = original;
          if (!committed) {
            state.observed.settled = true;
            throw new TypeError(
              'Verification: email reconciliation unavailable',
            );
          }
          const response = await original(...args);
          state.observed = { settled: true, status: response.status };
          await gate;
          return response;
        }
        return original(...args);
      };
    },
    committed,
  );
}

export function passwordRaceFault(page, concurrentPassword) {
  return install(
    page,
    (concurrentPassword) => {
      const original = window.fetch;
      const state = { original, releases: [], observed: { settled: false } };
      window.__accountFault = state;
      window.fetch = async (...args) => {
        if (
          new URL(String(args[0]), location.href).pathname !==
          '/api/account/password'
        )
          return original(...args);
        window.fetch = original;
        const body = JSON.parse(args[1].body);
        const other = original(args[0], {
          ...args[1],
          body: JSON.stringify({
            ...body,
            newPassword: concurrentPassword,
            confirmPassword: concurrentPassword,
          }),
        });
        const own = original(...args);
        const [otherResponse, response] = await Promise.all([other, own]);
        state.observed = {
          settled: true,
          otherStatus: otherResponse.status,
          otherCode: (await otherResponse.clone().json()).code,
          ownStatus: response.status,
          ownCode: (await response.clone().json()).code,
        };
        return response;
      };
    },
    concurrentPassword,
  );
}

export async function accountLogoutFault(page) {
  const fault = await install(page, () => {
    const original = window.fetch;
    const state = {
      original,
      releases: [],
      observed: { started: false, settled: false },
    };
    let releaseBackground;
    const backgroundGate = new Promise((resolve) => {
      releaseBackground = resolve;
      state.releases.push(resolve);
    });
    const logoutGate = new Promise((resolve) => state.releases.push(resolve));
    window.__accountFault = state;
    window.fetch = async (...args) => {
      const path = new URL(String(args[0]), location.href).pathname;
      if (path === '/api/auth/sign-out') {
        const response = await original(...args);
        state.observed.status = response.status;
        releaseBackground();
        await logoutGate;
        return response;
      }
      if (path === '/api/auth/get-session' && !state.observed.started) {
        state.observed.started = true;
        await backgroundGate;
        const response = await original(...args);
        state.observed.session = await response.clone().json();
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            state.observed.settled = true;
          });
        });
        return response;
      }
      return original(...args);
    };
    window.dispatchEvent(new Event('focus'));
  });
  return {
    ...fault,
    async waitForBackground() {
      await page.waitForFunction(() => window.__accountFault.observed.started);
    },
  };
}
