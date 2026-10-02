import { useState, type ComponentProps } from 'react';
import { jsx } from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { DetailVersions } from '../../../src/components/library/detail-workspace';
import { DetailReprocess } from '../../../src/components/library/detail-reprocess';
import { DetailReprocessConfirmation } from '../../../src/components/library/detail-reprocess-confirmation';
import {
  useDetailReprocess,
  type ReprocessQuery,
  type ReprocessNavigation,
} from '../../../src/components/library/use-detail-reprocess';
import type { LibraryDetail } from '../../../src/server/library/detail-types';

const detail: LibraryDetail = {
  id: 'help-test-image',
  displayName: '测试图片',
  originalName: 'test.png',
  format: 'png',
  mime: 'image/png',
  width: 64,
  height: 48,
  byteSize: 128,
  animated: false,
  pageCount: 1,
  classification: 'static',
  visibility: 'private',
  createdAt: '2026-10-02T00:00:00Z',
  trashedAt: null,
  deletionStatus: null,
  storage: { id: 'help-test-storage', name: '测试存储', enabled: true },
  albums: [],
  tags: [],
  processingStatus: 'ready',
  activeJob: null,
  latestFailedJob: null,
  metadataJob: null,
  processingJob: null,
  versions: [
    {
      kind: 'original',
      applicable: true,
      saved: true,
      status: 'saved',
      format: 'png',
      mime: 'image/png',
      width: 64,
      height: 48,
      byteSize: 128,
      previewPath: null,
      downloadPath: null,
      links: null,
      unavailableReason: null,
    },
  ],
  defaultVersion: 'original',
  defaultLink: {
    actualVersion: 'original',
    links: null,
    downloadPath: null,
    unavailableReason: null,
  },
  reprocess: {
    compressionEnabled: true,
    watermarkEnabled: false,
    expectedVersions: ['compressed', 'thumbnail'],
    scopes: {
      all: null,
      compressed: null,
      thumbnail: null,
      watermark: '水印处理开关已关闭',
    },
  },
  actions: {
    editUnavailableReason: null,
    reprocessUnavailableReason: null,
    metadataReadUnavailableReason: null,
  },
};
type Props = ComponentProps<typeof DetailReprocess>;
const state: Props['state'] = {
  scope: 'all',
  confirmed: false,
  receipt: null,
  error: '',
  unknown: false,
  pending: false,
  choose: () => {},
  cancelConfirmation: () => {},
  reset: () => {},
  submit: async () => {},
  detail,
  view: { kind: 'selection', confirmation: null },
  canSubmit: true,
  choicesDisabled: false,
  checking: false,
  readError: null,
  canResume: false,
  reconcile: async () => {},
  resume: () => {},
  open: () => {},
  returnToDetail: () => {},
  footerActions: [],
};
const query: ReprocessQuery = {
  data: detail,
  isFetching: false,
  isError: false,
  error: null,
  expired: false,
  refetch: async () => ({ data: detail, isError: false, error: null }),
  onMutationPending: () => {},
  setUnavailable: () => {},
};
const navigation: ReprocessNavigation = {
  onReturn: () => {},
  onClose: () => {},
  onVersions: () => {},
  onOpen: () => {},
};
const renderReprocess = (record = detail, controller = state) =>
  renderToStaticMarkup(
    jsx(DetailReprocess, {
      state: { ...controller, detail: record },
    }),
  );

it('keeps version policy behind a named, initially closed help trigger', () => {
  const html = renderToStaticMarkup(
    jsx(DetailVersions, {
      detail,
      selected: 'original',
      onClose: () => {},
    }),
  );
  expect(html).toContain('aria-label="查看版本说明"');
  expect(html).toContain('aria-haspopup="dialog"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain('没有历史回滚功能');
  expect(html).toContain('返回图库');
  expect(html).toContain('PNG · 64 × 48');
});

it('collapses process policy while retaining selected outputs and disabled reasons', () => {
  const html = renderReprocess();
  expect(html).toContain('aria-label="查看处理说明"');
  expect(html).not.toContain('所选新版本全部成功后一起替换');
  expect(html).toContain('本次将更新：压缩图、缩略图');
  expect(html).toContain('水印处理开关已关闭');
  expect(html.match(/type="radio"/g)).toHaveLength(4);
  expect(html).toContain('disabled=""');
});

it('keeps storage unavailability visible once when all scopes share the reason', () => {
  const reason = '存储已停用：help-test-storage';
  const html = renderReprocess({
    ...detail,
    storage: { ...detail.storage, enabled: false },
    reprocess: {
      ...detail.reprocess,
      scopes: {
        all: reason,
        compressed: reason,
        thumbnail: reason,
        watermark: reason,
      },
    },
  });
  expect(html).toContain('存储已停用 · 内容不可读');
  expect(html.match(/存储已停用：help-test-storage/g)).toHaveLength(1);
  expect(html.match(/type="radio"/g)).toHaveLength(4);
  expect(html.match(/disabled=""/g)).toHaveLength(4);
});

it('keeps the replacement contract visible before submitting a single scope', () => {
  const html = renderToStaticMarkup(
    jsx(DetailReprocessConfirmation, {
      detail,
      scope: 'compressed',
      controls: state,
      onCancel: () => {},
      onResume: () => {},
    }),
  );
  expect(html).toContain('role="alertdialog"');
  expect(html).toContain('重新生成压缩图');
  expect(html).toContain('<dt class="text-muted">更新</dt><dd>压缩图</dd>');
  expect(html).toContain('<dt class="text-muted">保留</dt><dd>原图</dd>');
  expect(html).not.toContain('查看处理说明');
  expect(html).toContain('取消');
  expect(html).toContain('提交仅压缩图');
  expect(html).not.toContain('提交时记录最新设置');
});

it('keeps uncertain submission errors visible and disables duplicate submission in the dialog', () => {
  const html = renderToStaticMarkup(
    jsx(DetailReprocessConfirmation, {
      detail,
      scope: 'thumbnail',
      controls: {
        ...state,
        canSubmit: false,
        error: '连接中断，提交结果待核对',
      },
      onCancel: () => {},
      onResume: () => {},
    }),
  );
  expect(html).toContain('连接中断，提交结果待核对');
  expect(html).toContain('核对详情');
  expect(html.match(/disabled=""/g)).toHaveLength(1);
});

it('keeps detail reconciliation failures visible and blocks submission while cancellation remains available', () => {
  const html = renderToStaticMarkup(
    jsx(DetailReprocessConfirmation, {
      detail,
      scope: 'thumbnail',
      controls: {
        ...state,
        canSubmit: false,
        readError: new Error('图片记录不存在'),
      },
      onCancel: () => {},
      onResume: () => {},
    }),
  );
  expect(html).toContain('详情核对失败：图片记录不存在');
  expect(html).toContain('取消');
  expect(html.match(/disabled=""/g)).toHaveLength(1);
});

it('retains the chosen scope on cancel and reopens confirmation without creating a receipt', () => {
  function Probe() {
    const [step, setStep] = useState(0);
    const controller = useDetailReprocess(detail.id, query, navigation);
    if (step === 0) controller.choose('thumbnail');
    if (step === 1) {
      expect(controller.confirmed).toBe(true);
      controller.cancelConfirmation();
    }
    if (step === 2) {
      expect(controller.scope).toBe('thumbnail');
      expect(controller.confirmed).toBe(false);
      expect(controller.receipt).toBeNull();
      controller.choose(controller.scope);
    }
    if (step === 3) {
      expect(controller.scope).toBe('thumbnail');
      expect(controller.confirmed).toBe(true);
      expect(controller.receipt).toBeNull();
    } else setStep(step + 1);
    return null;
  }
  renderToStaticMarkup(jsx(Probe, {}));
});

it('never collapses actionable submission errors into help', () => {
  const html = renderReprocess(detail, {
    ...state,
    unknown: true,
    error: '提交结果待核对，请核对详情后再操作',
  });
  expect(html).toContain('提交结果待核对，请核对详情后再操作');
  expect(html).toContain('核对详情');
});

it('offers manual range recovery only when the controller confirms it is available', () => {
  const html = renderReprocess(detail, {
    ...state,
    unknown: true,
    canSubmit: false,
    canResume: true,
    error: '提交结果待核对，请核对详情后再操作',
  });
  expect(html).toContain('重新选择处理范围');
  const blocked = renderReprocess(detail, {
    ...state,
    unknown: true,
    canSubmit: false,
    canResume: false,
    error: '提交结果待核对，请核对详情后再操作',
  });
  expect(blocked).not.toContain('重新选择处理范围');
});
