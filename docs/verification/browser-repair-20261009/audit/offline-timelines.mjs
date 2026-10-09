import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const timeTimeline = { name: 'DocumentTimeline' };
const scrollTimeline = { name: 'ScrollTimeline' };
let animations = [];
const document = {
  timeline: timeTimeline,
  getAnimations: () => animations,
  querySelector: () => ({
    closest: () => ({
      getAnimations: (options) => {
        assert.equal(options.subtree, true);
        return animations;
      },
    }),
  }),
};
async function extract(file, anchor, endMarker) {
  const source = await readFile(file, 'utf8');
  const start = source.indexOf(
    'await page.waitForFunction(',
    source.indexOf(anchor),
  );
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'Extract the actual wait call');
  let predicate;
  let argument;
  vm.runInNewContext(source.slice(start, end).replace('await ', ''), {
    document,
    revokeDialog: '[data-testid="api-revoke-dialog"]',
    page: {
      waitForFunction: (fn, value) => {
        predicate = fn;
        argument = value;
      },
    },
  });
  return () => predicate(argument);
}
const shellReady = await extract(
  'e2e/owner-shell.mjs',
  "action: 'wait-running-animations'",
  '\n        await page.screenshot',
);
const tokenReady = await extract(
  'e2e/tokens-behavior.mjs',
  'async function assertWorkingAction(',
  '\n  const pending = ',
);
const animation = (timeline, playState = 'running', iterations = 1) => ({
  timeline,
  playState,
  effect: { getTiming: () => ({ iterations }) },
});
for (const [name, ready] of [
  ['shell', shellReady],
  ['token', tokenReady],
]) {
  animations = [animation(timeTimeline)];
  assert.equal(ready(), false, `${name}: finite time transition must finish`);
  animations = [animation(scrollTimeline)];
  assert.equal(
    ready(),
    true,
    `${name}: scroll-driven effect is not a time transition`,
  );
  animations.push(animation(timeTimeline));
  assert.equal(
    ready(),
    false,
    `${name}: a scroll effect cannot hide a time transition`,
  );
  animations = [animation(timeTimeline, 'finished'), animation(scrollTimeline)];
  assert.equal(
    ready(),
    true,
    `${name}: finished time transition releases the boundary`,
  );
  animations = [animation(timeTimeline, 'paused')];
  assert.equal(
    ready(),
    true,
    `${name}: paused time effect does not keep running`,
  );
  console.log(
    `PASS: ${name} waits DocumentTimeline running effects, releases ScrollTimeline effects, rechecks mixed and finished inventories`,
  );
}
animations = [animation(timeTimeline, 'running', Infinity)];
assert.equal(
  shellReady(),
  true,
  'Shell does not wait forever for continuous time animations',
);
console.log('PASS: shell preserves the existing infinite-iteration exclusion');
