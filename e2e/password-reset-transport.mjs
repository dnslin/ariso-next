/** Delay or lose a real recovery response; never fabricate a success. */
export async function observePasswordReset(
  page,
  { hold = false, lose = false } = {},
) {
  await page.evaluate(
    ({ hold, lose }) => {
      const original = window.fetch;
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const state = {
        original,
        release,
        requests: [],
        responses: [],
        reads: [],
      };
      window.__passwordResetTransport = state;
      window.fetch = async (...args) => {
        const path = new URL(String(args[0]), location.href).pathname;
        if (
          ![
            '/api/auth/request-password-reset',
            '/api/auth/reset-password',
          ].includes(path)
        )
          return original(...args);
        state.requests.push({ path, method: args[1]?.method ?? 'GET' });
        const response = await original(...args);
        const body = await response
          .clone()
          .json()
          .catch(() => null);
        state.responses.push({
          path,
          status: response.status,
          code: body?.code,
          retryAfter: Number(response.headers.get('x-retry-after')),
        });
        if (hold) await gate;
        if (lose && response.status !== 429)
          throw new TypeError(
            'Verification: recovery response lost after real request',
          );
        const readJson = response.json.bind(response);
        response.json = async (...jsonArgs) => {
          const body = await readJson(...jsonArgs);
          state.reads.push({ path, status: response.status });
          return body;
        };
        return response;
      };
    },
    { hold, lose },
  );
  return {
    async settled() {
      await page.waitForFunction(
        () => window.__passwordResetTransport.responses.length > 0,
      );
      return this.observed();
    },
    async observed() {
      return page.evaluate(() => ({
        requests: window.__passwordResetTransport.requests,
        responses: window.__passwordResetTransport.responses,
      }));
    },
    async release() {
      await page.evaluate(() => window.__passwordResetTransport.release());
    },
    async read() {
      await page.waitForFunction(
        () => window.__passwordResetTransport.reads.length > 0,
      );
    },
    async dispose() {
      await page.evaluate(() => {
        const state = window.__passwordResetTransport;
        if (!state) return;
        state.release();
        window.fetch = state.original;
        delete window.__passwordResetTransport;
      });
    },
  };
}
