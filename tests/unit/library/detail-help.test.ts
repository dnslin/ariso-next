import type { ComponentProps } from 'react';
import { jsx } from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { DetailVersions } from '../../../src/components/library/detail-workspace';
import { DetailReprocess } from '../../../src/components/library/detail-reprocess';
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
  imageId: detail.id,
  scope: 'all',
  confirmed: false,
  receipt: null,
  error: '',
  unknown: false,
  pending: false,
  dismissedJobId: null,
  choose: () => {},
  reset: () => {},
  submit: async () => {},
};
const query = { isFetching: false } as Props['query'];
const renderReprocess = (record = detail, controller = state) =>
  renderToStaticMarkup(
    jsx(DetailReprocess, {
      detail: record,
      state: controller,
      query,
      onReturn: () => {},
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
  const html = renderReprocess(detail, {
    ...state,
    scope: 'compressed',
    confirmed: true,
  });
  expect(html).toContain('只替换压缩图，缩略图和水印图保持不变');
  expect(html).toContain('aria-label="查看处理说明"');
  expect(html).not.toContain('提交时记录最新设置');
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
