'use client';

import { AlertDialog } from '@heroui/react/alert-dialog';
import { Button } from '@heroui/react/button';
import type { LibraryDetail } from '../../server/library/detail-types';
import type { ReprocessScope } from './request-reprocess';
import type { useDetailReprocess } from './use-detail-reprocess';
import type { useDetailQuery } from './use-detail-query';
import { DetailIdentity } from './detail-workspace';
import { versionLabels } from './detail-labels';

export function DetailReprocessConfirmation({
  detail,
  scope,
  state,
  query,
  onCancel,
}: {
  detail: LibraryDetail;
  scope: Exclude<ReprocessScope, 'all'>;
  state: ReturnType<typeof useDetailReprocess>;
  query: ReturnType<typeof useDetailQuery>;
  onCancel: () => void;
}) {
  const unavailable = detail.reprocess.scopes[scope];
  return (
    <AlertDialog.Dialog
      data-testid="reprocess-confirmation"
      aria-busy={state.pending}
      className="flex max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 flex-col gap-5 overflow-hidden rounded-xl border border-border bg-surface p-5 sm:p-6"
    >
      <AlertDialog.Header className="shrink-0">
        <AlertDialog.Heading className="text-xl font-medium">
          重新生成{versionLabels[scope]}
        </AlertDialog.Heading>
      </AlertDialog.Header>
      <AlertDialog.Body className="grid min-h-0 gap-4 overflow-y-auto text-sm leading-6 [overflow-wrap:anywhere]">
        <DetailIdentity detail={detail} compact />
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
          <dt className="text-muted">更新</dt>
          <dd>{versionLabels[scope]}</dd>
          <dt className="text-muted">保留</dt>
          <dd>
            {detail.versions
              .filter((version) => version.saved && version.kind !== scope)
              .map((version) => versionLabels[version.kind])
              .join('、') || '无其他已保存版本'}
          </dd>
        </dl>
        {scope === 'watermark' && detail.reprocess.compressionEnabled ? (
          <p className="text-[13px] leading-5 text-muted">
            临时压缩结果只用于制作水印，不替换压缩图。
          </p>
        ) : null}
        {unavailable ? <p role="alert">{unavailable}</p> : null}
        {query.isError ? (
          <p role="alert">详情核对失败：{query.error.message}</p>
        ) : null}
        {state.error ? (
          <div className="grid justify-items-start gap-2">
            <p role="alert" className="text-danger">
              {state.error}
            </p>
            <Button
              variant="outline"
              className="min-h-11 rounded-lg"
              isDisabled={query.isFetching}
              onPress={() => {
                void query.refetch();
              }}
            >
              核对详情
            </Button>
          </div>
        ) : null}
      </AlertDialog.Body>
      <AlertDialog.Footer className="grid shrink-0 grid-cols-2 gap-3">
        <Button
          autoFocus
          variant="outline"
          className="h-12 w-full rounded-lg"
          isDisabled={state.pending}
          onPress={onCancel}
        >
          取消
        </Button>
        <Button
          data-testid="reprocess-submit"
          className="h-12 w-full rounded-lg"
          isDisabled={
            state.pending ||
            state.unknown ||
            query.isFetching ||
            query.isError ||
            !!unavailable
          }
          onPress={() => {
            void state.submit();
          }}
        >
          {state.pending ? '正在提交…' : `提交仅${versionLabels[scope]}`}
        </Button>
      </AlertDialog.Footer>
    </AlertDialog.Dialog>
  );
}
