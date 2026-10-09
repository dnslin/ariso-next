import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const src = await readFile('tests/experiments/ui/library-browser.mjs', 'utf8');
const hook = src.slice(
  src.indexOf('function observeRequests()'),
  src.indexOf('\nexport async function verifyLibrary'),
);
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function setup(code = hook) {
  const response = new Response('upstream error body', { status: 503 });
  let calls = 0;
  const original = async () => {
    calls++;
    return response;
  };
  const window = { fetch: original };
  vm.runInNewContext(`${code}; observeRequests();`, {
    window,
    location: { href: 'http://review.localhost' },
    URL,
    Promise,
  });
  window.__libraryHoldError = true;
  return { window, response, original, calls: () => calls };
}
const good = await setup();
let returned = false;
const pending = good.window.fetch('/library/data?q=error').then((r) => {
  returned = true;
  return r;
});
await tick();
assert.equal(returned, false);
assert.equal(good.window.__libraryHeldError.released, false);
assert.equal(good.window.__libraryHeldError.status, 503);
assert.equal(good.calls(), 1);
good.window.__libraryReleaseError();
assert.equal(await pending, good.response);
assert.equal(await good.response.text(), 'upstream error body');
assert.equal(good.window.__libraryHeldError.released, true);
good.window.__restoreLibraryFetch();
assert.equal(good.window.fetch, good.original);
console.log(
  'PASS: held upstream Response and body identity; native request once; explicit release; fetch restored',
);
const cleanup = await setup();
const cleanupPending = cleanup.window.fetch('/library/data?q=error');
await tick();
const held = cleanup.window.__libraryHeldError;
cleanup.window.__restoreLibraryFetch();
assert.equal(await cleanupPending, cleanup.response);
assert.equal(held.released, true);
assert.equal(cleanup.window.fetch, cleanup.original);
assert.equal(cleanup.window.__libraryHeldError, undefined);
console.log(
  'PASS: restore while pending preserves upstream Response; no cleanup-generated rejection',
);
const mutant = await setup(
  hook.replace('window.__libraryHoldError\n', '!window.__libraryHoldError\n'),
);
let mutantReturned = false;
const mp = mutant.window.fetch('/library/data?q=error').then((r) => {
  mutantReturned = true;
  return r;
});
await tick();
assert.throws(() => assert.equal(mutantReturned, false), {
  code: 'ERR_ASSERTION',
});
await mp;
mutant.window.__restoreLibraryFetch();
console.log(
  'PASS: inverted holding condition killed by pending-response evidence',
);
const shell = await readFile('e2e/owner-shell.mjs', 'utf8');
const start = shell.indexOf(
  'await page.waitForFunction(() =>',
  shell.indexOf("action: 'wait-running-animations'"),
);
const end = shell.indexOf('\n        await page.screenshot', start);
const expression = shell.slice(start, end).replace('await ', '');
let animations = [];
let actualPredicate;
vm.runInNewContext(expression, {
  document: { getAnimations: () => animations },
  page: {
    waitForFunction: (p) => {
      actualPredicate = p;
    },
  },
});
const running = {
  playState: 'running',
  effect: { getTiming: () => ({ iterations: 1 }) },
};
const paused = {
  playState: 'paused',
  effect: { getTiming: () => ({ iterations: 1 }) },
};
const infinite = {
  playState: 'running',
  effect: { getTiming: () => ({ iterations: Infinity }) },
};
animations = [running];
assert.equal(actualPredicate(), false);
animations = [paused, infinite];
assert.equal(actualPredicate(), true);
animations.push(running);
assert.equal(actualPredicate(), false);
animations = [];
assert.equal(actualPredicate(), true);
console.log(
  'PASS: shell wait rejects current finite running animation, tolerates paused/infinite, re-reads changed animation inventory',
);
