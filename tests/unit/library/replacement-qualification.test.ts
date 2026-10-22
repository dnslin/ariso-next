import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { useDetailReplacement } from '../../../src/components/library/use-detail-replacement';
import type { ReplacementSnapshot } from '../../../src/components/library/replacement-session';

const runtime = vi.hoisted(() => ({ snapshot: {} as ReplacementSnapshot }));
vi.mock(
  '../../../src/components/library/replacement-session',
  async (original) => ({
    ...(await original<
      typeof import('../../../src/components/library/replacement-session')
    >()),
    ReplacementSession: class {
      getSnapshot = () => runtime.snapshot;
      subscribe = () => () => {};
    },
  }),
);

beforeEach(() => {
  runtime.snapshot = {
    setup: { unavailableReason: null, job: null },
    selecting: false,
    checking: false,
    uploading: false,
    transferComplete: false,
    progress: null,
    job: null,
    error: '',
    unknown: false,
  };
});

function disabled() {
  let result: boolean | undefined;
  function Probe() {
    result = useDetailReplacement({
      imageId: 'image',
      onCompleted: vi.fn(),
      onChanged: vi.fn(),
      onSessionExpire: vi.fn(),
    }).choicesDisabled;
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return result;
}

it.each([
  { setup: null, checking: true },
  { setup: null, checking: false },
  {
    setup: { unavailableReason: '当前图片已有活动内容任务', job: null },
    checking: false,
  },
])(
  'keeps file selection available before the user starts a replacement: %j',
  (state) => {
    Object.assign(runtime.snapshot, state);
    expect(disabled()).toBe(false);
  },
);

it('disables repeated file selection while the chosen file awaits qualification', () => {
  Object.assign(runtime.snapshot, { selecting: true, checking: true });
  expect(disabled()).toBe(true);
});

it.each([{ uploading: true }, { unknown: true }])(
  'preserves duplicate-submission protection for %j',
  (state) => {
    Object.assign(runtime.snapshot, state);
    expect(disabled()).toBe(true);
  },
);
