'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { Modal } from '@heroui/react/modal';
import { bytesLabel } from '../library/detail-labels';
import type { UploadController } from './controller';
import {
  captureUploadClipboard,
  captureUploadDrop,
  scanUploadInput,
  uploadAccept,
  type UploadInputReport,
  type UploadInputSource,
} from './input';

type InputDialog = {
  state: 'scanning' | 'stopped' | 'complete' | 'unsupported';
  report?: UploadInputReport;
};

/** Own only the active page's input scan. The shared queue owns accepted files. */
export function useUploadInput(controller: UploadController | null) {
  const files = useRef<HTMLInputElement>(null);
  const directory = useRef<HTMLInputElement>(null);
  const operation = useRef<AbortController | null>(null);
  const origin = useRef<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<InputDialog | null>(null);
  const [dragging, setDragging] = useState(false);
  const directoryRef = useCallback((node: HTMLInputElement | null) => {
    directory.current = node;
    node?.setAttribute('webkitdirectory', '');
  }, []);
  const close = useCallback(() => {
    setDialog(null);
    requestAnimationFrame(() =>
      (origin.current?.isConnected
        ? origin.current
        : document.getElementById('upload-title')
      )?.focus({ preventScroll: true }),
    );
  }, []);
  const ingest = useCallback(
    async (source: UploadInputSource, scanning = false) => {
      if (!controller) return;
      operation.current?.abort();
      const abort = new AbortController();
      operation.current = abort;
      origin.current = document.activeElement as HTMLElement | null;
      if (scanning) setDialog({ state: 'scanning' });
      const report = await scanUploadInput(source, controller, {
        signal: abort.signal,
        onProgress: (report) => {
          if (operation.current === abort && scanning)
            setDialog({ state: 'scanning', report });
        },
      });
      if (operation.current !== abort) return;
      operation.current = null;
      if (scanning || Object.values(report.rejected).some((count) => count))
        setDialog({
          state: report.cancelled ? 'stopped' : 'complete',
          report,
        });
    },
    [controller],
  );
  useEffect(() => {
    if (!controller) return;
    const paste = (event: ClipboardEvent) => {
      if (
        !event.clipboardData ||
        (event.target instanceof Element &&
          event.target.closest(
            'input, textarea, select, [contenteditable="true"], [role="dialog"]',
          ))
      )
        return;
      const source = captureUploadClipboard(event.clipboardData);
      if (source.kind !== 'clipboard' || !source.files.length) return;
      event.preventDefault();
      void ingest(source);
    };
    document.addEventListener('paste', paste);
    return () => {
      document.removeEventListener('paste', paste);
      operation.current?.abort();
      operation.current = null;
    };
  }, [controller, ingest]);
  function chooseFiles() {
    close();
    files.current?.click();
  }
  function chooseDirectory() {
    close();
    if (directory.current && 'webkitdirectory' in directory.current) {
      directory.current.click();
    } else {
      origin.current = document.activeElement as HTMLElement | null;
      setDialog({ state: 'unsupported' });
    }
  }
  return {
    controls: (
      <>
        <input
          ref={files}
          type="file"
          multiple
          aria-label="选择图片文件"
          accept={uploadAccept}
          className="hidden"
          onChange={(event) => {
            const selected = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            void ingest({ kind: 'files', files: selected });
          }}
        />
        <input
          ref={directoryRef}
          type="file"
          multiple
          aria-label="选择图片文件夹"
          className="hidden"
          onChange={(event) => {
            const selected = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            if (selected.length)
              void ingest({ kind: 'files', files: selected }, true);
          }}
        />
      </>
    ),
    dialog,
    dragging,
    ingest,
    chooseFiles,
    chooseDirectory,
    close,
    stop: () => operation.current?.abort(),
    zoneProps: {
      onDragOver: (event: React.DragEvent) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setDragging(true);
      },
      onDragLeave: (event: React.DragEvent) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDragging(false);
      },
      onDrop: (event: React.DragEvent) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDragging(false);
        const source = captureUploadDrop(event.dataTransfer);
        void ingest(
          source,
          source.kind === 'drop' &&
            source.entries.some(
              (entry) => !(entry instanceof File) && entry.isDirectory,
            ),
        );
      },
    },
  };
}

export function UploadInputDialog({
  input,
  maxFileBytes,
  queueCount,
  queueLimit,
  completedCount,
  clearCompleted,
}: {
  input: ReturnType<typeof useUploadInput>;
  maxFileBytes: number;
  queueCount: number;
  queueLimit: number;
  completedCount: number;
  clearCompleted: () => void;
}) {
  const dialog = input.dialog;
  if (!dialog) return null;
  const report = dialog.report;
  const rejected = report?.rejected;
  const full = !!rejected?.capacity;
  const title =
    dialog.state === 'unsupported'
      ? '当前浏览器无法读取文件夹'
      : dialog.state === 'scanning'
        ? '正在扫描文件夹'
        : dialog.state === 'stopped'
          ? '扫描已停止'
          : full
            ? '队列已满'
            : '文件扫描完成';
  return (
    <Modal.Backdrop
      isOpen
      isDismissable={false}
      onOpenChange={(open) => {
        if (!open) {
          if (dialog.state === 'scanning') input.stop();
          else input.close();
        }
      }}
    >
      <Modal.Container placement="center" className="w-full p-4">
        <Modal.Dialog
          data-testid="upload-input-dialog"
          className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-6 text-foreground shadow-none [&_.button]:min-h-12 [&_.button]:rounded-lg [&_.button]:font-normal"
        >
          <Modal.Header>
            <Modal.Heading className="text-xl font-medium leading-normal">
              {title}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="m-0 grid flex-none gap-4 p-0 text-sm leading-normal text-foreground">
            <div role="status" aria-live="polite">
              {dialog.state === 'unsupported' ? (
                <p>可以继续使用普通文件选择上传多张图片。</p>
              ) : dialog.state === 'scanning' ? (
                <>
                  <p>已发现 {report?.discovered ?? 0} 个文件</p>
                  <p>已加入 {report?.added ?? 0} 张图片，扫描仍在继续。</p>
                </>
              ) : dialog.state === 'stopped' ? (
                <>
                  <p>已加入的 {report?.added ?? 0} 张图片保留在待上传队列。</p>
                  <p>未扫描的文件不会继续加入。</p>
                </>
              ) : full ? (
                <>
                  <p>
                    {queueCount} / {queueLimit} 项，其中 {completedCount}{' '}
                    项已完成。
                  </p>
                  <p>本次多出的 {rejected!.capacity} 个文件未加入。</p>
                </>
              ) : (
                <p>
                  已加入 {report?.added ?? 0} 张 · 未加入{' '}
                  {Object.values(rejected ?? {}).reduce(
                    (sum, count) => sum + count,
                    0,
                  )}{' '}
                  项
                </p>
              )}
            </div>
            {dialog.state !== 'stopped' ? (
              <div className="grid gap-4 rounded-lg bg-default p-3 text-[13px] leading-normal">
                {dialog.state === 'unsupported' ? (
                  <p>
                    粘贴只读取图片，不支持粘贴网址导入。部分格式无法本地预览时，仍可正常上传。
                  </p>
                ) : dialog.state === 'scanning' ? (
                  <p>仅加入图片，不保留文件夹层级，也不会自动创建相册。</p>
                ) : (
                  <>
                    {full ? (
                      <p>
                        成功、失败和已取消结果也占名额。清空已完成只移除页面记录，不会删除图片。
                      </p>
                    ) : null}
                    {rejected &&
                    Object.entries(rejected).some(
                      ([reason, count]) => reason !== 'capacity' && count > 0,
                    ) ? (
                      <div role="alert">
                        {rejected?.format ? (
                          <p>
                            不支持的格式 {rejected.format}{' '}
                            项（不支持的格式不能上传）
                          </p>
                        ) : null}
                        {rejected?.empty ? (
                          <p>文件为空 {rejected.empty} 项</p>
                        ) : null}
                        {rejected?.size ? (
                          <p>
                            文件大小超过上传上限 {bytesLabel(maxFileBytes)}：
                            {rejected.size} 项
                          </p>
                        ) : null}
                        {rejected?.permission ? (
                          <>
                            <p>文件或目录读取失败 {rejected.permission} 项</p>
                            <p className="[overflow-wrap:anywhere]">
                              {report?.permissionError}
                            </p>
                          </>
                        ) : null}
                        {rejected?.name ? (
                          <p>文件名不符合要求 {rejected.name} 项</p>
                        ) : null}
                      </div>
                    ) : null}
                    {!full ? (
                      <p>
                        允许文件大小等于 {bytesLabel(maxFileBytes)}
                        ；服务器仍会核验真实格式。
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </Modal.Body>
          <Modal.Footer className="m-0 grid w-full shrink-0 items-stretch justify-stretch gap-4 [&_.button]:h-12 [&_.button]:w-full">
            {dialog.state === 'scanning' ? (
              <Button autoFocus onPress={input.stop}>
                停止扫描
              </Button>
            ) : dialog.state === 'unsupported' ? (
              <>
                <Button autoFocus onPress={input.chooseFiles}>
                  选择图片
                </Button>
                <Button variant="outline" onPress={input.close}>
                  返回上传
                </Button>
              </>
            ) : full && dialog.state !== 'stopped' ? (
              <>
                <Button
                  autoFocus
                  isDisabled={!completedCount}
                  onPress={() => {
                    clearCompleted();
                    input.close();
                  }}
                >
                  清空已完成
                </Button>
                <Button variant="outline" onPress={input.close}>
                  返回队列
                </Button>
              </>
            ) : (
              <>
                <Button autoFocus onPress={input.close}>
                  {dialog.state === 'stopped' ? '查看队列' : '查看待上传图片'}
                </Button>
                <Button
                  variant="outline"
                  onPress={
                    dialog.state === 'stopped'
                      ? input.chooseDirectory
                      : input.chooseFiles
                  }
                >
                  {dialog.state === 'stopped'
                    ? '重新选择文件夹'
                    : '重新选择文件'}
                </Button>
              </>
            )}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
