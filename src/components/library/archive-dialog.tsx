'use client';

import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { CloseButton } from '@heroui/react/close-button';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Modal } from '@heroui/react/modal';
import { Select } from '@heroui/react/select';
import { Spinner } from '@heroui/react/spinner';
import { Check, FolderDown } from 'lucide-react';
import {
  archiveVersions,
  type ArchiveVersion,
} from '../../server/library/archive-types';
import { bytesLabel, versionLabels } from './detail-labels';
import { BatchThumbnail } from './batch-targets';
import type { LibraryArchive } from './use-library-archive';

export function ArchiveDialog({ archive }: { archive: LibraryArchive }) {
  const workspace = archive.workspace;
  if (!workspace) return null;
  const result = workspace.result;
  const entries = workspace.items.filter(
    (item) => !workspace.excluded.includes(item.id),
  );
  const started = workspace.phase === 'started';
  const canStart =
    !archive.pending &&
    !!result?.downloadUrl &&
    !!result.items.length &&
    !result.unavailable.length;
  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) archive.close();
      }}
    >
      <Modal.Container placement="center" scroll="inside" className="p-4">
        <Modal.Dialog
          data-testid="library-archive-dialog"
          aria-label="打包下载"
          aria-busy={archive.pending}
          className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-128 gap-0 rounded-[14px] border border-border bg-background p-5 dark:bg-surface sm:p-6"
        >
          <Modal.Header className="mb-4 flex flex-row items-center justify-between gap-3">
            <Modal.Heading className="text-xl font-semibold">
              打包下载
            </Modal.Heading>
            <CloseButton
              aria-label="关闭打包下载"
              onPress={archive.close}
              className="size-11 shrink-0 rounded-lg bg-transparent"
            />
          </Modal.Header>
          <Modal.Body className="m-0 grid min-w-0 auto-rows-max content-start gap-4 p-0 text-sm leading-6">
            {started ? (
              <div
                role="status"
                className="grid justify-items-center gap-3 text-center"
              >
                <Check size={28} aria-hidden />
                <h3 className="text-lg font-medium">已发起下载</h3>
                <p className="text-muted">
                  请在浏览器下载列表查看进度、完成结果或取消下载。页面不会自动判断下载是否完成。
                </p>
              </div>
            ) : (
              <>
                <p className="text-muted">
                  已选 {workspace.items.length} 张 · 当前页{' '}
                  {workspace.currentCount} 张 · 其他页{' '}
                  {workspace.items.length - workspace.currentCount} 张
                </p>
                <Select
                  value={workspace.version}
                  isDisabled={archive.pending}
                  onChange={(key) => {
                    if (key !== null)
                      archive.chooseVersion(String(key) as ArchiveVersion);
                  }}
                >
                  <Label className="font-medium">下载版本</Label>
                  <Select.Trigger
                    data-testid="library-archive-version"
                    className="h-12 rounded-lg border border-border bg-background text-sm shadow-none dark:bg-surface"
                  >
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {archiveVersions.map((kind) => (
                        <ListBox.Item
                          key={kind}
                          id={kind}
                          textValue={versionLabels[kind]}
                          className="min-h-11"
                        >
                          {versionLabels[kind]}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
                <ul
                  aria-label="本次下载清单"
                  className="max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-border px-3"
                >
                  {entries.map((item) => {
                    const ready = result?.items.find(
                      (entry) => entry.imageId === item.id,
                    );
                    const unavailable = result?.unavailable.find(
                      (entry) => entry.imageId === item.id,
                    );
                    return (
                      <li
                        key={item.id}
                        className="grid min-w-0 grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-3 last:border-0"
                      >
                        <BatchThumbnail
                          key={item.thumbnailUrl}
                          url={item.storage.enabled ? item.thumbnailUrl : null}
                          size={48}
                          className="size-12 rounded-lg"
                        />
                        <div className="grid min-w-0 gap-0.5 [overflow-wrap:anywhere]">
                          <p className="text-sm">
                            {ready?.filename ?? item.displayName}
                          </p>
                          <p className="text-xs leading-5 text-muted">
                            {item.visibility === 'private' ? '私有' : '公开'}
                            {' · '}
                            {item.storage.name}
                          </p>
                        </div>
                        <span
                          className={`max-w-24 text-right text-xs [overflow-wrap:anywhere] sm:max-w-40 ${unavailable ? 'text-danger' : 'text-muted'}`}
                        >
                          {unavailable?.reason ??
                            (ready
                              ? bytesLabel(ready.byteSize)
                              : archive.pending
                                ? '正在检查'
                                : '待检查')}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {archive.pending ? (
                  <p
                    role="status"
                    className="flex items-center gap-2 text-muted"
                  >
                    <Spinner size="sm" />
                    正在核对版本与文件可读状态…
                  </p>
                ) : null}
                {result?.unavailable.length ? (
                  <Alert
                    status="danger"
                    role="alert"
                    className="gap-2.5 rounded-xl border border-danger/40 bg-danger/5 p-3 shadow-none"
                  >
                    <Alert.Indicator
                      aria-hidden
                      className="mt-0.5 shrink-0 p-0 [&_svg]:size-[18px]"
                    />
                    <Alert.Content className="min-w-0 gap-1">
                      <Alert.Description className="text-[13px] leading-6 text-danger">
                        {result.unavailable.length}{' '}
                        张图片不可下载。请改选版本，或明确排除后继续。
                      </Alert.Description>
                      <Button
                        variant="ghost"
                        className="min-h-11 w-fit justify-self-start px-0 text-danger"
                        onPress={archive.excludeUnavailable}
                      >
                        从本次下载排除这 {result.unavailable.length} 张
                      </Button>
                    </Alert.Content>
                  </Alert>
                ) : result?.items.length ? (
                  <p role="status" className="text-xs text-muted">
                    {result.items.length} 张 · 合计{' '}
                    {bytesLabel(result.totalBytes)} · 同名文件自动加编号
                  </p>
                ) : null}
                {workspace.error ? (
                  <Alert
                    status="danger"
                    role="alert"
                    className="gap-2.5 rounded-xl border border-danger/40 bg-danger/5 p-3 shadow-none"
                  >
                    <Alert.Indicator
                      aria-hidden
                      className="mt-0.5 shrink-0 p-0 [&_svg]:size-[18px]"
                    />
                    <Alert.Content className="min-w-0">
                      <Alert.Description className="text-[13px] leading-6 text-danger [overflow-wrap:anywhere]">
                        {workspace.error}
                      </Alert.Description>
                    </Alert.Content>
                  </Alert>
                ) : null}
                {workspace.excluded.length ? (
                  <p className="text-xs text-muted">
                    已从本次下载排除 {workspace.excluded.length}{' '}
                    张，图库选择未改变。
                  </p>
                ) : null}
                <p className="text-xs text-muted">
                  私有图片不会因此公开。
                  {workspace.version === 'original'
                    ? '原图可能包含 GPS 和拍摄信息。'
                    : ''}
                  下载过程中请在浏览器下载列表查看结果。
                </p>
              </>
            )}
          </Modal.Body>
          <Modal.Footer className="mt-6 flex flex-wrap justify-end gap-3 p-0">
            {!started ? (
              <Button
                variant="outline"
                className="min-h-12 rounded-lg px-4"
                onPress={archive.close}
              >
                {archive.pending ? '取消检查' : '取消'}
              </Button>
            ) : null}
            <Button
              data-testid="library-archive-submit"
              className="min-h-12 gap-2 rounded-lg px-4"
              isDisabled={
                !started &&
                (archive.pending ||
                  !entries.length ||
                  entries.length > 200 ||
                  !!result?.unavailable.length)
              }
              onPress={
                started
                  ? archive.close
                  : canStart
                    ? archive.start
                    : archive.recheck
              }
            >
              {!started ? <FolderDown size={18} aria-hidden /> : null}
              {started
                ? '知道了'
                : archive.pending
                  ? '正在检查…'
                  : canStart
                    ? '开始下载'
                    : '重新检查'}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
