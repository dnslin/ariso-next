'use client';

import { AlertDialog } from '@heroui/react/alert-dialog';
import { Button } from '@heroui/react/button';
import type { LibraryDetail } from '../../server/library/detail-types';
import type { ReprocessScope } from './request-reprocess';
import type { DetailReprocessController } from './use-detail-reprocess';
import { DetailIdentity } from './detail-workspace';
import { versionLabels } from './detail-labels';

export function DetailReprocessConfirmation({
  detail,
  scope,
  controls,
  onCancel,
  onResume,
}: {
  detail: LibraryDetail;
  scope: Exclude<ReprocessScope, 'all'>;
  controls: Pick<
    DetailReprocessController,
    | 'pending'
    | 'canSubmit'
    | 'checking'
    | 'readError'
    | 'error'
    | 'canResume'
    | 'reconcile'
    | 'submit'
  >;
  onCancel: () => void;
  onResume: () => void;
}) {
  const unavailable = detail.reprocess.scopes[scope];
  return (
    <AlertDialog.Dialog
      data-testid="reprocess-confirmation"
      aria-busy={controls.pending}
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
        {controls.readError ? (
          <p role="alert">详情核对失败：{controls.readError.message}</p>
        ) : null}
        {controls.error ? (
          <div className="grid justify-items-start gap-2">
            <p role="alert" className="text-danger">
              {controls.error}
            </p>
            <Button
              variant="outline"
              className="min-h-11 rounded-lg"
              isDisabled={controls.checking}
              onPress={() => {
                void controls.reconcile();
              }}
            >
              核对详情
            </Button>
            {controls.canResume ? (
              <Button
                variant="outline"
                className="min-h-11 rounded-lg"
                onPress={onResume}
              >
                重新选择处理范围
              </Button>
            ) : null}
          </div>
        ) : null}
      </AlertDialog.Body>
      <AlertDialog.Footer className="grid shrink-0 grid-cols-2 gap-3">
        <Button
          autoFocus
          variant="outline"
          className="h-12 w-full rounded-lg"
          isDisabled={controls.pending}
          onPress={onCancel}
        >
          取消
        </Button>
        <Button
          data-testid="reprocess-submit"
          className="h-12 w-full rounded-lg"
          isDisabled={!controls.canSubmit}
          onPress={() => {
            void controls.submit();
          }}
        >
          {controls.pending ? '正在提交…' : `提交仅${versionLabels[scope]}`}
        </Button>
      </AlertDialog.Footer>
    </AlertDialog.Dialog>
  );
}
