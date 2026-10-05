/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const task = await taskSpace(config.spaceId);
console.log({ taskSpaceId: task.spaceId, ownership: task.ownership });
assert.equal(
  task.ownership,
  'agent',
  'Browser control is required to continue',
);
console.log(await task.page(config.pageLabel).snapshot());
