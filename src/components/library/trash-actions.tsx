'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertDialog } from '@heroui/react/alert-dialog';
import { Button } from '@heroui/react/button';
import { Spinner } from '@heroui/react/spinner';
import type { LibraryDetail } from '../../server/library/detail-types';
import { DetailReadError, readDetail } from './read-detail';
import { bytesLabel } from './detail-labels';

/** A lost write response is reconciled by reading; never retry the write automatically. */
export function TrashAction({
  record,
  operation,
  onPending,
  onVerified,
  onComplete,
  onUnavailable,
}: {
  record: LibraryDetail;
  operation: 'trash' | 'restore';
  onPending?: (pending: boolean) => void;
  onVerified: (record: LibraryDetail) => void;
  onComplete: (record: LibraryDetail) => void;
  onUnavailable: (status: 401 | 404) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [message, setMessage] = useState('');
  const running = useRef(false);
  const failure = useRef('');
  const mounted = useRef(true);
  const readRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      readRequest.current?.abort();
    };
  }, []);
  const restoring = operation === 'restore';
  const disabled =
    !!record.deletionStatus ||
    (restoring ? !record.trashedAt : !!record.trashedAt);

  async function reconcile() {
    try {
      const controller = new AbortController();
      readRequest.current = controller;
      const current = await readDetail(record.id, controller.signal);
      if (!mounted.current) return;
      onVerified(current);
      onPending?.(false);
      setUnknown(false);
      if (
        !current.deletionStatus &&
        (restoring ? current.trashedAt === null : current.trashedAt !== null)
      ) {
        setOpen(false);
        onComplete(current);
      } else {
        setMessage(
          `${failure.current}${current.deletionStatus ? '已核对：图片已开始永久删除，不能恢复或回收。' : '已核对：记录状态尚未改变。可确认后重新提交。'}`,
        );
      }
    } catch (error) {
      if (!mounted.current) return;
      if (
        error instanceof DetailReadError &&
        (error.status === 401 || error.status === 404)
      ) {
        onUnavailable(error.status);
        return;
      }
      setUnknown(true);
      setMessage(
        `${failure.current}结果待核对。${error instanceof Error ? error.message : '无法读取当前记录。'}请重新核对，不要重复提交。`,
      );
    }
  }

  async function run(write: boolean) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    onPending?.(true);
    setMessage(write ? '正在提交并核对记录…' : '正在核对当前记录…');
    try {
      if (write) {
        failure.current = '';
        try {
          const response = await fetch(
            `/api/images/${encodeURIComponent(record.id)}/${operation}`,
            { method: 'POST' },
          );
          if (!response.ok) {
            const reasons: Record<number, string> = {
              401: '登录已失效',
              403: '请求来源被拒绝',
              404: '图片不存在',
              409: '图片状态冲突',
              500: '服务内部错误',
            };
            failure.current = `${reasons[response.status] ?? '提交失败'}（HTTP ${response.status}）。`;
          }
        } catch (error) {
          failure.current = `连接中断，未收到提交结果。${error instanceof Error ? error.message : ''} `;
        }
      }
      if (mounted.current) await reconcile();
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <AlertDialog
        isOpen={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <Button
          variant={restoring ? 'primary' : 'outline'}
          className="min-h-12 w-full rounded-lg"
          isDisabled={disabled && !unknown}
          onPress={() => setOpen(true)}
        >
          {unknown ? '结果待核对' : restoring ? '恢复图片' : '回收图片'}
        </Button>
        <AlertDialog.Backdrop isKeyboardDismissDisabled={busy}>
          <AlertDialog.Container placement="center" className="p-4">
            <AlertDialog.Dialog
              data-testid="trash-confirm"
              className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-6 [overflow-wrap:anywhere]"
            >
              <AlertDialog.Header>
                <AlertDialog.Heading>
                  {restoring ? '恢复这张图片？' : '将这张图片移入回收站？'}
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body className="grid gap-4 text-sm">
                <p>
                  {record.displayName} · {bytesLabel(record.byteSize)}
                </p>
                <p className="rounded-lg bg-default p-3">
                  {restoring
                    ? '沿用原 ID 和可见性，保留仍存在的相册与标签关系，不会重新启动处理任务。恢复后的内容访问仍取决于权限、处理结果和存储状态。'
                    : '内容链接将不可访问，文件仍占用空间，不会自动清理；可以从回收站恢复。'}
                </p>
                {message ? (
                  <p role={busy ? 'status' : 'alert'}>
                    {busy ? <Spinner size="sm" /> : null}
                    {message}
                  </p>
                ) : null}
              </AlertDialog.Body>
              <AlertDialog.Footer className="grid grid-cols-1 gap-3">
                <Button
                  autoFocus
                  variant="outline"
                  className="min-h-12 w-full rounded-lg"
                  isDisabled={busy}
                  onPress={() => setOpen(false)}
                >
                  {message ? '关闭' : '取消'}
                </Button>
                <Button
                  className="min-h-12 w-full rounded-lg"
                  isDisabled={busy || (disabled && !unknown)}
                  onPress={() => {
                    void run(!unknown);
                  }}
                >
                  {busy
                    ? '正在核对…'
                    : unknown
                      ? '重新核对'
                      : restoring
                        ? '确认恢复'
                        : '确认回收'}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
      {disabled ? (
        <p className="text-sm">
          {record.deletionStatus
            ? '图片已开始永久删除，不能回收或恢复。'
            : restoring
              ? '记录已在图库。'
              : '记录已在回收站。'}
        </p>
      ) : null}
      {unknown && !open ? (
        <p role="alert" className="text-sm">
          结果待核对，暂不展示旧内容。请重新打开核对。
        </p>
      ) : null}
    </div>
  );
}
