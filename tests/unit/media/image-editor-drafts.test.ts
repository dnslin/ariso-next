import { afterEach, expect, it, vi } from 'vitest';
import { hasUnsavedImageEdits } from '../../../src/components/image-editor/session-state';
import { ImageEditSession } from '../../../src/components/image-editor/session';
import {
  copyImageEditRecipe,
  emptyImageEditRecipe,
} from '../../../src/shared/image-editing';

const recipe = emptyImageEditRecipe();
recipe.regions = [
  {
    id: 'mask',
    x: 0,
    y: 0,
    width: 0.2,
    height: 0.2,
    mode: 'solid',
    strength: 10,
    color: '#000000',
  },
];
const history = { first: { current: recipe } };
const intent = {
  requestId: 'request-one',
  sourceImageId: 'first',
  sourceObjectId: 'object-one',
  mode: 'copy' as const,
  recipe,
};
const job = {
  ...intent,
  jobId: 'job-one',
  resultImageId: 'copy-one',
  status: 'succeeded',
  step: 'complete',
  error: null,
  finishedAt: null,
};
afterEach(() => vi.unstubAllGlobals());

it('未提交的单图或批量配方需要保护，无编辑或已撤销为空则可离开', () => {
  expect(hasUnsavedImageEdits(history, [], [])).toBe(true);
  expect(hasUnsavedImageEdits({}, [], [])).toBe(false);
  expect(
    hasUnsavedImageEdits(
      { first: { current: emptyImageEditRecipe() } },
      [],
      [],
    ),
  ).toBe(false);
});

it('已创建但尚未提交的批量项仍是草稿，已受理配方可离开而不取消任务', async () => {
  const session = new ImageEditSession(intent, intent);
  expect(
    hasUnsavedImageEdits(history, [session], [session.getSnapshot()]),
  ).toBe(true);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(job)),
  );
  await session.submit();
  expect(
    hasUnsavedImageEdits(history, [session], [session.getSnapshot()]),
  ).toBe(false);
  expect(
    hasUnsavedImageEdits(
      { ...history, second: { current: recipe } },
      [session],
      [session.getSnapshot()],
    ),
  ).toBe(true);
});

it('受理后继续修改仍需确认，恢复到已提交配方才清除脏状态', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(job)),
  );
  const session = new ImageEditSession(intent, intent);
  await session.submit();
  const changed = copyImageEditRecipe(recipe);
  changed.regions[0].color = '#FFFFFF';
  expect(
    hasUnsavedImageEdits(
      { first: { current: changed } },
      [session],
      [session.getSnapshot()],
    ),
  ).toBe(true);
  expect(
    hasUnsavedImageEdits(history, [session], [session.getSnapshot()]),
  ).toBe(false);
});
