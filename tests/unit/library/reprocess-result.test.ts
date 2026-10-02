import { jsx } from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { DetailReprocessResult } from '../../../src/components/library/detail-reprocess-result';
import { receiptJob } from '../../../src/components/library/detail-reprocess-model';
import type { LibraryDetail } from '../../../src/server/library/detail-types';
import type { LibraryProcessingJob } from '../../../src/server/library/types';
import type { ReprocessReceipt } from '../../../src/components/library/request-reprocess';

const receipt: ReprocessReceipt = {
  jobId: 'accepted',
  status: 'queued',
  scope: 'thumbnail',
  expectedVersions: ['thumbnail'],
};
const job: LibraryProcessingJob = {
  id: 'accepted',
  status: 'running',
  step: 'thumbnail',
  scope: 'thumbnail',
  expectedVersions: ['thumbnail'],
  generatedVersions: [],
  error: null,
};
const detail = {
  id: 'image',
  displayName: '独立图片',
  byteSize: 128,
  storage: { enabled: true },
  processingStatus: 'ready',
  processingJob: job,
  versions: [
    {
      kind: 'thumbnail',
      saved: true,
      status: 'saved',
      format: 'webp',
      width: 400,
      height: 300,
      byteSize: 128,
      previewPath: null,
    },
  ],
} as LibraryDetail;
const render = (record: LibraryDetail) =>
  renderToStaticMarkup(
    jsx(DetailReprocessResult, {
      detail: record,
      receipt,
      job: receiptJob(record, receipt),
      onReturn: () => {},
    }),
  );

it('uses the accepted job ID and never treats an unrelated successful task as this result', () => {
  const other = {
    ...detail,
    processingJob: { ...job, id: 'other', status: 'succeeded' as const },
  };
  expect(receiptJob(other, receipt)).toBeNull();
  const html = render(other);
  expect(html).toContain('尚未读取到本任务的最新状态');
  expect(html).not.toContain('重新处理完成');
});

it('keeps real process failures distinct from the usable old image', () => {
  const html = render({
    ...detail,
    processingJob: { ...job, status: 'failed', error: '编码器退出' },
  });
  expect(html).toContain('重新处理失败');
  expect(html).toContain('独立图片 · 当前图片仍可用');
  expect(html).toContain('编码器退出');
  expect(html).toContain('未替换任何版本');
  expect(html).not.toContain('重新处理完成');
});

it('renders success only for the selected versions from the accepted snapshot', () => {
  const html = render({
    ...detail,
    processingJob: { ...job, status: 'succeeded' },
  });
  expect(html).toContain('重新处理完成');
  expect(html).toContain('WEBP');
  expect(html).toContain('新版本已生效');
  expect(html).toContain('已更新');
  expect(html).not.toContain('水印图');
  expect(html).not.toContain('压缩图');
});

it('retains cancellation as an actual non-success outcome', () => {
  const html = render({
    ...detail,
    processingJob: { ...job, status: 'cancelled', error: '任务取消' },
  });
  expect(html).toContain('任务已取消');
  expect(html).not.toContain('重新处理完成');
});

it('shows generated candidates separately from published versions using actual stored output', () => {
  const multiple = {
    ...receipt,
    scope: 'all' as const,
    expectedVersions: ['compressed', 'thumbnail', 'watermark'] as const,
  };
  const html = renderToStaticMarkup(
    jsx(DetailReprocessResult, {
      detail,
      receipt: multiple,
      job: {
        ...job,
        scope: 'all',
        step: 'thumbnail',
        generatedVersions: ['compressed'],
      },
      onReturn: () => {},
    }),
  );
  expect(html).toContain('候选已生成');
  expect(html).toContain('尚未替换');
  expect(html).toContain('缩略图 / 水印图');
  expect(html).toContain('全部成功后一起替换');
  expect(html).not.toContain('已更新');
});

it('does not infer a generated candidate from the processing step', () => {
  const html = render(detail);
  expect(html).toContain('处理中');
  expect(html).not.toContain('候选已生成');
});
