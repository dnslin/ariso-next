import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const file = 'tests/experiments/ui/library-browser.mjs';
const src = await readFile(file, 'utf8');
const hook = src.slice(
  src.indexOf('function observeRequests()'),
  src.indexOf('\nexport async function verifyLibrary'),
);
const dir = await mkdtemp(join(tmpdir(), 'ariso-browser-review-'));
await writeFile(join(dir, 'observeRequests.mjs'), hook);
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function setup(code = hook) {
  const response = new Response('upstream error body', {
    status: 503,
    headers: { 'x-review': 'actual-upstream' },
  });
  const argsSeen = [];
  const original = async (...args) => {
    argsSeen.push(args);
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
  return { window, response, original, argsSeen };
}
const good = await setup();
let returned = false;
const pending = good.window
  .fetch('/library/data?q=error', { method: 'GET' })
  .then((r) => {
    returned = true;
    return r;
  });
await tick();
assert.equal(returned, false);
assert.equal(good.window.__libraryHeldError.status, 503);
assert.equal(good.window.__libraryHeldError.released, false);
assert.equal(good.argsSeen.length, 1);
good.window.__libraryReleaseError();
assert.equal(await pending, good.response);
assert.equal(await good.response.text(), 'upstream error body');
assert.equal(good.window.__libraryHeldError.released, true);
good.window.__restoreLibraryFetch();
assert.equal(good.window.fetch, good.original);
console.log(
  'PASS: pending gate, exact upstream Response/body identity, one native request, explicit release and fetch restoration',
);
const mutant = await setup(
  hook.replace('window.__libraryHoldError\n', '!window.__libraryHoldError\n'),
);
let mutantReturned = false;
const mutantPending = mutant.window.fetch('/library/data?q=error').then((r) => {
  mutantReturned = true;
  return r;
});
await tick();
try {
  assert.equal(mutantReturned, false);
  throw new Error('Mutation survived');
} catch (e) {
  assert.equal(e.code, 'ERR_ASSERTION');
  console.log(
    'PASS: inverted holding condition fails pending-response evidence assertion',
  );
}
await mutantPending;
mutant.window.__restoreLibraryFetch();
const cleanup = await setup();
const cleanupPending = cleanup.window.fetch('/library/data?q=error');
await tick();
cleanup.window.__restoreLibraryFetch();
try {
  assert.equal(await cleanupPending, cleanup.response);
  console.log('PASS: cleanup releases pending upstream Response');
} catch (e) {
  console.log('FAIL: cleanup pending gate:', e.name, e.message);
}
console.log('Temporary extraction:', dir);
