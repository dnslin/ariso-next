/** Observe or lose actual SMTP HTTP responses without manufacturing server results. */
export async function smtpTransport(
  page,
  {
    method,
    lose = false,
    hold = false,
    read = false,
    loseReadAfterWrite = false,
    concurrentWrite,
    holdSession = false,
    holdReadAfterWrite = false,
  } = {},
) {
  const initialize = ({
    method,
    lose,
    hold,
    loseReadAfterWrite,
    concurrentWrite,
    holdSession,
    holdReadAfterWrite,
  }) => {
    const original = window.fetch;
    const state = {
      original,
      requests: [],
      responses: [],
      releases: [],
      sessionReads: [],
      delivered: [],
    };
    window.__smtpTransport = state;
    const gate = new Promise((resolve) => state.releases.push(resolve));
    let used = false;
    let lostRead = false;
    window.fetch = async (...args) => {
      const path = new URL(String(args[0]), location.href).pathname;
      const verb = (args[1]?.method ?? 'GET').toUpperCase();
      if (holdSession && path === '/api/auth/get-session') {
        const response = await original(...args);
        const empty = (await response.clone().json()) === null;
        state.sessionReads.push({ status: response.status, empty });
        if (empty) await gate;
        state.sessionDelivered = (state.sessionDelivered ?? 0) + 1;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            state.sessionDeliveryFrame = state.sessionDelivered;
          }),
        );
        return response;
      }
      if (!path.startsWith('/api/settings/smtp')) return original(...args);
      const body = args[1]?.body ? JSON.parse(args[1].body) : undefined;
      state.requests.push({
        path,
        method: verb,
        fields: body ? Object.keys(body) : [],
        ...(body
          ? {
              hasPasswordField: Object.hasOwn(body, 'password'),
              clearCredentials: body.clearCredentials,
            }
          : {}),
      });
      const response = await original(...args);
      const result = await response.clone().json();
      state.responses.push({
        path,
        method: verb,
        status: response.status,
        code: result?.code,
        diagnostic: result?.diagnostic,
      });
      if (used && verb === 'GET' && holdReadAfterWrite) await gate;
      if (used && verb === 'GET' && loseReadAfterWrite && !lostRead) {
        lostRead = true;
        throw new TypeError('Verification: SMTP readback response lost');
      }
      if (!used && method === verb) {
        used = true;
        if (hold) await gate;
        if (concurrentWrite) {
          const changed = await original('/api/settings/smtp', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(concurrentWrite),
          });
          state.concurrentWrite = {
            status: changed.status,
            fields: Object.keys(concurrentWrite),
          };
          await changed.arrayBuffer();
        }
        if (lose)
          throw new TypeError(
            'Verification: SMTP response lost after real request',
          );
      }
      state.delivered.push({ path, method: verb, status: response.status });
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          state.deliveryFrame = state.delivered.length;
        }),
      );
      return response;
    };
  };
  let identifier;
  if (read) {
    ({ identifier } = await page.cdp('Page.addScriptToEvaluateOnNewDocument', {
      source: `(${initialize.toString()})(${JSON.stringify({ method, lose, hold, loseReadAfterWrite, concurrentWrite, holdSession, holdReadAfterWrite })});`,
    }));
  } else
    await page.evaluate(initialize, {
      method,
      lose,
      hold,
      loseReadAfterWrite,
      concurrentWrite,
      holdSession,
      holdReadAfterWrite,
    });
  return {
    async observed() {
      return page.evaluate(() => {
        const state = window.__smtpTransport;
        return {
          requests: state.requests,
          responses: state.responses,
          concurrentWrite: state.concurrentWrite,
          sessionReads: state.sessionReads,
          delivered: state.delivered,
        };
      });
    },
    async settled(verb = method) {
      await page.waitForFunction(
        (verb) =>
          window.__smtpTransport.responses.some(
            (response) => response.method === verb,
          ),
        verb,
      );
      return this.observed();
    },
    async release() {
      await page.evaluate(() =>
        window.__smtpTransport.releases.forEach((release) => release()),
      );
    },
    async dispose() {
      if (identifier)
        await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
          identifier,
        });
      await page.evaluate(() => {
        const state = window.__smtpTransport;
        if (!state) return;
        state.releases.forEach((release) => release());
        window.fetch = state.original;
        delete window.__smtpTransport;
      });
    },
  };
}
