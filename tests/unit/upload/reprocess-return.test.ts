import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import {
  useDetailReprocess,
  type DetailReprocessFooterAction,
  type ReprocessQuery,
} from '../../../src/components/library/use-detail-reprocess';
import type { LibraryDetail } from '../../../src/server/library/detail-types';
import type { LibraryProcessingJob } from '../../../src/server/library/types';
import type { ReprocessReceipt } from '../../../src/components/library/request-reprocess';

const receipt: ReprocessReceipt = {
  jobId: 'accepted-task',
  scope: 'thumbnail',
  status: 'queued',
  expectedVersions: ['thumbnail'],
};

// The browser has already accepted this submission. Only initialize that retained
// receipt; the real model still matches the live job and derives its result view.
vi.mock(
  '../../../src/components/library/detail-reprocess-model',
  async (original) => {
    const actual =
      await original<
        typeof import('../../../src/components/library/detail-reprocess-model')
      >();
    return {
      ...actual,
      initialReprocessState: (imageId: string | null) => ({
        ...actual.initialReprocessState(imageId),
        receipt,
      }),
    };
  },
);

function footer(status: LibraryProcessingJob['status'], closeLabel?: string) {
  const detail = {
    id: 'uploaded-image',
    processingStatus: 'ready',
    processingJob: {
      id: receipt.jobId,
      status,
      scope: receipt.scope,
      step: 'thumbnail',
      expectedVersions: ['thumbnail'],
      generatedVersions: status === 'succeeded' ? ['thumbnail'] : [],
      error: null,
    },
    reprocess: {
      scopes: { all: null, compressed: null, thumbnail: null, watermark: null },
    },
  } as LibraryDetail;
  const query: ReprocessQuery = {
    data: detail,
    isFetching: false,
    isError: false,
    error: null,
    expired: false,
    refetch: async () => ({ data: detail, isError: false, error: null }),
    onMutationPending: vi.fn(),
    setUnavailable: vi.fn(),
  };
  const navigation = {
    onClose: vi.fn(),
    onReturn: vi.fn(),
    onOpen: vi.fn(),
    onVersions: vi.fn(),
    closeLabel,
  };
  let actions: DetailReprocessFooterAction[] = [];
  function Probe() {
    actions = useDetailReprocess(detail.id, query, navigation).footerActions!;
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return { actions, navigation };
}

it.each([
  [undefined, '返回图库'],
  ['返回上传', '返回上传'],
])(
  'names the successful close action for its source (%s) and invokes that source exit',
  (closeLabel, expected) => {
    const { actions, navigation } = footer('succeeded', closeLabel);
    expect(actions.map((action) => action.label)).toEqual([
      expected,
      '查看图片详情',
    ]);
    actions[0].onPress();
    expect(navigation.onClose).toHaveBeenCalledOnce();
    expect(navigation.onReturn).not.toHaveBeenCalled();
    actions[1].onPress();
    expect(navigation.onReturn).toHaveBeenCalledOnce();
  },
);

it.each([
  ['queued', '返回图片详情'],
  ['running', '返回详情'],
  ['failed', '返回详情'],
  ['cancelled', '返回详情'],
] as const)(
  'keeps %s results returning to their detail instead of closing the upload context',
  (status, label) => {
    const { actions, navigation } = footer(status, '返回上传');
    expect(actions[0].label).toBe(label);
    actions[0].onPress();
    expect(navigation.onReturn).toHaveBeenCalledOnce();
    expect(navigation.onClose).not.toHaveBeenCalled();
  },
);
