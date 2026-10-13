/** Install in the page with page.evaluate; responses and fixture data stay real.
 * @param {{ path: string, q: string }} [fixture]
 */
export function installReadControl(fixture) {
  const original = window.fetch;
  const paused = new Set();
  const pending = new Set();
  const requests = new Map();
  const control = (window.__motionReadControl = {
    pause(paths) {
      paused.clear();
      paths.forEach((path) => paused.add(path));
    },
    get held() {
      return pending.size;
    },
    count(path) {
      return requests.get(path) ?? 0;
    },
    release() {
      paused.clear();
      [...pending].forEach((release) => release());
    },
    restore() {
      this.release();
      window.fetch = original;
    },
  });
  window.fetch = async (...args) => {
    const [input, init] = args;
    const request = input instanceof Request ? input : null;
    if ((init?.method ?? request?.method ?? 'GET').toUpperCase() !== 'GET')
      return original(...args);
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
      window.location.href,
    );
    const path = url.pathname;
    if (fixture && path === fixture.path && !url.searchParams.get('q')) {
      url.searchParams.set('q', fixture.q);
      args[0] = request ? new Request(url, request) : url.href;
    }
    requests.set(path, control.count(path) + 1);
    const response = await original(...args);
    if (!paused.has(path)) return response;
    const signal = init?.signal === undefined ? request?.signal : init.signal;
    signal?.throwIfAborted();
    await new Promise((resolve, reject) => {
      const release = () => {
        pending.delete(release);
        signal?.removeEventListener('abort', abort);
        resolve();
      };
      const abort = () => {
        pending.delete(release);
        signal.removeEventListener('abort', abort);
        reject(signal.reason);
      };
      pending.add(release);
      signal?.addEventListener('abort', abort, { once: true });
    });
    return response;
  };
}
