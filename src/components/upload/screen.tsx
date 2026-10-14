'use client';

import { DelayedLoading } from '../delayed-loading';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { Card } from '@heroui/react/card';
import { Toolbar } from '@heroui/react/toolbar';
import { Tooltip } from '@heroui/react/tooltip';
import { ArrowLeft, CheckCircle2, CloudUpload } from 'lucide-react';
import { OwnerShell } from '../shell/owner-shell';
import { LibraryDetail } from '../library/detail';
import { useDetailQuery } from '../library/use-detail-query';
import { bytesLabel } from '../library/detail-labels';
import { UploadSettingsFields } from './settings';
import {
  useUploadDraft,
  useUploadQueue,
  uploadTerminalStates,
} from './provider';
import { uploadContextItems, uploadDraftKey } from './context';
import { UploadQueueItem } from './item';
import { useUploadInput, UploadInputDialog } from './input-controls';
import { UploadSubmissionSummaries } from './submission-summary';
import { UploadDraftSummary } from './draft-summary';
import { ComponentEntrance } from '../component-entrance';

type ScreenProps = {
  name: string;
  logoUrl?: string | null;
  description: string;
  email: string;
  ownerName: string;
  initialSidebarCollapsed: boolean;
  albumId?: string;
  returnTo?: string;
};
export function UploadScreen(props: ScreenProps) {
  const router = useRouter();
  const {
    client,
    query,
    settings,
    controller,
    items: allItems,
    refreshSettings,
  } = useUploadQueue();
  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);
  const {
    chosenStorageId,
    setStorageId,
    chosenVisibility,
    setVisibility,
    chosenAlbums,
    chosenTags,
  } = useUploadDraft(props.albumId);
  const items = uploadContextItems(allItems, props.albumId);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailQuery = useDetailQuery(client, detailId, '/upload');
  const input = useUploadInput(controller, uploadDraftKey(props.albumId));
  const trigger = useRef<HTMLElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const openDetail = useCallback(
    (id: string, element: HTMLElement) => {
      trigger.current = element;
      setDetailId(id);
    },
    [setDetailId],
  );
  const queuedCount = items.filter((item) => item.state === 'queued').length;
  const completedCount = items.filter((item) =>
    uploadTerminalStates.has(item.state),
  ).length;
  const terminal = items.length > 0 && completedCount === items.length;
  const saving =
    items.length > 0 && items.every((item) => item.state === 'saving');
  const uploading = items.some((item) => item.state === 'uploading');
  const readyCount = items.filter((item) => item.state === 'ready').length;
  const hasStarted = items.some((item) => item.state !== 'queued');
  const dialogRef = useCallback((node: HTMLElement | null) => {
    if (!node)
      requestAnimationFrame(() =>
        (trigger.current?.isConnected
          ? trigger.current
          : document.getElementById('upload-title')
        )?.focus({ preventScroll: true }),
      );
  }, []);
  if (!settings)
    return (
      <OwnerShell {...props}>
        <section className="grid gap-5 md:gap-6" aria-labelledby="upload-title">
          <UploadHeading title="上传图片" returnTo={props.returnTo} />
          {query.isPending ? (
            <DelayedLoading>
              <p role="status">正在读取上传设置…</p>
            </DelayedLoading>
          ) : (
            <div className="grid gap-4">
              <Alert status="danger" role="alert">
                <Alert.Content>
                  <Alert.Title>上传设置读取失败</Alert.Title>
                  <Alert.Description>{query.error?.message}</Alert.Description>
                </Alert.Content>
              </Alert>
              <Button
                className="min-h-11"
                onPress={() => {
                  void query.refetch();
                }}
              >
                重试读取设置
              </Button>
            </div>
          )}
        </section>
      </OwnerShell>
    );
  if (!controller)
    return (
      <OwnerShell {...props}>
        <section className="grid gap-5 md:gap-6" aria-labelledby="upload-title">
          <UploadHeading title="上传图片" returnTo={props.returnTo} />
          <DelayedLoading>
            <p role="status">正在准备上传队列…</p>
          </DelayedLoading>
        </section>
      </OwnerShell>
    );
  const storageId = chosenStorageId ?? settings.defaultStorageId;
  const visibility = chosenVisibility ?? settings.defaultVisibility;
  const selectedStorage = settings.storages.find(
    (s) => s.id === storageId && s.enabled,
  );
  const sourceAlbum = settings.albums.find(
    (album) => album.id === props.albumId,
  );
  const missingSourceAlbum = !!props.albumId && !sourceAlbum;
  const choose = input.chooseFiles;
  return (
    <OwnerShell
      {...props}
      footer={
        <div className="flex w-full flex-wrap items-center gap-3 md:justify-end [&_.button]:min-h-12 [&_.button]:rounded-lg">
          {props.returnTo && readyCount > 0 ? (
            <Link
              href={props.returnTo}
              className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm text-foreground no-underline"
            >
              <ArrowLeft size={17} aria-hidden />
              返回相册
            </Link>
          ) : null}
          {completedCount > 0 ? (
            <Button
              variant="outline"
              className="flex-1 md:max-w-45"
              data-testid="upload-clear-completed"
              onPress={() => {
                controller.clearCompleted(items.map((item) => item.id));
              }}
            >
              清空已完成
            </Button>
          ) : null}
          {items.length > 0 ? (
            <Button
              variant="outline"
              className="flex-1 md:hidden"
              onPress={choose}
            >
              继续添加
            </Button>
          ) : null}
          <Button
            className="flex-1 md:max-w-50"
            isDisabled={
              queuedCount === 0 || !selectedStorage || missingSourceAlbum
            }
            onPress={() => {
              if (selectedStorage)
                void controller.start(
                  visibility,
                  chosenStorageId !== undefined
                    ? selectedStorage.id
                    : undefined,
                  {
                    albumIds: chosenAlbums.map((album) => album.id),
                    tagIds: chosenTags.map((tag) => tag.id),
                    labels: {
                      storageId: selectedStorage.id,
                      storageName: selectedStorage.name,
                      albums: chosenAlbums.map(
                        (album) =>
                          settings.albums.find(
                            (current) => current.id === album.id,
                          ) ?? album,
                      ),
                      tags: chosenTags.map((tag) => ({
                        id: tag.id,
                        name:
                          settings.tags.find((current) => current.id === tag.id)
                            ?.displayName ?? tag.name,
                      })),
                    },
                  },
                  items
                    .filter((item) => item.state === 'queued')
                    .map((item) => item.id),
                );
            }}
          >
            开始上传
          </Button>
        </div>
      }
    >
      <section
        className="grid w-full min-w-0 gap-5 md:gap-6 [&_.button]:min-h-11 [&_.button]:rounded-lg"
        aria-labelledby="upload-title"
      >
        <UploadHeading
          title={
            terminal ? '本次上传结果' : saving ? '正在核对上传结果' : '上传图片'
          }
          returnTo={props.returnTo}
          icon={
            uploading ? (
              <span
                aria-hidden
                className="motion-safe:animate-pulse"
                data-testid="upload-motion"
              >
                <CloudUpload size={28} />
              </span>
            ) : terminal && readyCount > 0 ? (
              <span
                aria-hidden
                className="text-success"
                data-testid="upload-success-icon"
              >
                <CheckCircle2 size={28} />
              </span>
            ) : null
          }
        >
          {sourceAlbum ? (
            <p className="text-sm text-muted [overflow-wrap:anywhere]">
              {sourceAlbum.name}
            </p>
          ) : missingSourceAlbum ? (
            <p role="alert" className="text-sm text-danger">
              来源相册已不存在，无法从此入口开始上传。
            </p>
          ) : null}
          {terminal || saving ? (
            <p className="text-sm">
              {terminal
                ? `成功 ${readyCount} 张 · 失败 ${items.filter((item) => item.state === 'upload-failed' || item.state === 'processing-failed').length} 张 · 取消 ${items.filter((item) => item.state === 'cancelled').length} 张。清空结果不会删除图片。`
                : '文件传输结束，正在核对保存与处理结果。'}
            </p>
          ) : null}
        </UploadHeading>
        {input.controls}
        <div
          data-testid="upload-composition"
          className="grid min-w-0 items-start gap-3 md:grid-cols-[minmax(0,1fr)_360px] md:gap-6 min-[1200px]:max-w-[1280px]"
        >
          <div
            data-testid="upload-input-zone"
            {...input.zoneProps}
            className={`grid min-w-0 gap-3 rounded-[20px] ${input.dragging ? 'outline-2 outline-offset-2 outline-focus' : ''}`}
          >
            {items.length ? (
              <UploadDraftSummary
                storage={settings.storages.find((s) => s.id === storageId)}
                visibility={visibility}
                albumCount={chosenAlbums.length}
                tagCount={chosenTags.length}
                started={hasStarted}
                settingsRef={settingsRef}
              />
            ) : null}
            <UploadSubmissionSummaries items={items} />
            {items.length ? (
              <Card
                data-testid="upload-queue"
                className="min-w-0 gap-4 rounded-2xl border border-border bg-background px-3 py-4 shadow-none md:rounded-[20px] md:p-6"
              >
                <ComponentEntrance delay={0.055} className="hidden md:block">
                  <Toolbar
                    aria-label="上传队列操作"
                    className="hidden min-h-11 w-full flex-wrap items-center justify-between gap-3 md:flex"
                  >
                    <h2 className="text-lg font-medium">
                      {queuedCount > 0
                        ? `待上传 ${queuedCount} 张`
                        : `共 ${items.length} 张`}
                    </h2>
                    <div className="flex shrink-0 gap-2">
                      <Button variant="outline" onPress={input.chooseDirectory}>
                        选择文件夹
                      </Button>
                      <Tooltip>
                        <Button
                          variant="outline"
                          className="min-h-11 w-30 shrink-0"
                          onPress={choose}
                        >
                          继续添加
                        </Button>
                        <Tooltip.Content>
                          可多选图片，已选文件会保留
                        </Tooltip.Content>
                      </Tooltip>
                    </div>
                  </Toolbar>
                </ComponentEntrance>
                {items.map((item, index) => (
                  <ComponentEntrance
                    key={item.id}
                    delay={Math.min(index, 3) * 0.055}
                  >
                    <UploadQueueItem
                      item={item}
                      controller={controller}
                      client={client}
                      onOpen={openDetail}
                    />
                  </ComponentEntrance>
                ))}
              </Card>
            ) : (
              <ComponentEntrance delay={0.055} className="min-w-0">
                <Card
                  data-testid="upload-picker"
                  className="min-w-0 items-center justify-center gap-4 rounded-[20px] border border-dashed border-border bg-surface p-6 text-center shadow-none min-[1200px]:min-h-90 min-[1200px]:gap-0"
                >
                  <span
                    aria-hidden
                    data-testid="upload-idle-motion"
                    className="motion-safe:animate-[upload-float_2.8s_ease-in-out_infinite] min-[1200px]:mb-5 min-[1200px]:flex min-[1200px]:size-16 min-[1200px]:items-center min-[1200px]:justify-center min-[1200px]:rounded-2xl min-[1200px]:bg-default"
                  >
                    <CloudUpload className="size-8 min-[1200px]:size-10" />
                  </span>
                  <h2 className="text-xl font-medium leading-normal min-[1200px]:mb-2 min-[1200px]:text-[28px]">
                    <span className="md:hidden">选择要上传的图片</span>
                    <span className="hidden md:inline">拖入图片或粘贴截图</span>
                  </h2>
                  <div className="grid w-full grid-cols-2 gap-3 min-[1200px]:flex min-[1200px]:w-auto">
                    <Button
                      className="h-12 min-h-12 min-w-0 w-full px-2 font-normal min-[1200px]:w-40 min-[1200px]:px-4 min-[1200px]:font-medium"
                      onPress={choose}
                    >
                      选择图片
                    </Button>
                    <Button
                      variant="outline"
                      className="h-12 min-h-12 min-w-0 w-full px-2 font-normal min-[1200px]:w-40 min-[1200px]:px-4 min-[1200px]:font-medium"
                      onPress={input.chooseDirectory}
                    >
                      选择文件夹
                    </Button>
                  </div>
                  <p className="text-xs leading-5 text-muted min-[1200px]:mt-4 min-[1200px]:text-[13px]">
                    支持多选 · 单文件最大 {bytesLabel(settings.maxFileBytes)}
                  </p>
                </Card>
              </ComponentEntrance>
            )}
            {items.length ? (
              <Button
                variant="outline"
                className="mt-3 min-h-11 w-full md:hidden"
                onPress={input.chooseDirectory}
              >
                选择文件夹
              </Button>
            ) : null}
          </div>
          <ComponentEntrance delay={0.11} className="min-w-0">
            <div
              ref={settingsRef}
              id="upload-settings-fields"
              tabIndex={-1}
              className="min-w-0 scroll-mt-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <UploadSettingsFields
                albumId={props.albumId}
                started={hasStarted}
                settings={settings}
                storageId={storageId}
                visibility={visibility}
                disabled={false}
                onStorage={setStorageId}
                onVisibility={setVisibility}
              />
            </div>
          </ComponentEntrance>
        </div>
      </section>
      <UploadInputDialog
        input={input}
        maxFileBytes={settings.maxFileBytes}
        queueCount={allItems.length}
        queueLimit={settings.queueLimit}
        completedCount={
          allItems.filter((item) => uploadTerminalStates.has(item.state)).length
        }
        clearCompleted={() => controller.clearCompleted()}
      />
      {detailId ? (
        <LibraryDetail
          key={detailId}
          imageId={detailId}
          query={detailQuery}
          onVersions={(selected) => {
            router.push(
              `/library?image=${encodeURIComponent(detailId)}&detailView=versions&preview=${encodeURIComponent(selected)}`,
            );
          }}
          client={client}
          dialogRef={dialogRef}
          onClose={() => setDetailId(null)}
          onTrashed={() => {
            setDetailId(null);
            void client.invalidateQueries({ queryKey: ['upload-result'] });
          }}
        />
      ) : null}
    </OwnerShell>
  );
}

function UploadHeading({
  title,
  returnTo,
  icon,
  children,
}: {
  title: string;
  returnTo?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <ComponentEntrance className="grid gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <h1
          id="upload-title"
          tabIndex={-1}
          className="flex items-center gap-3 text-[28px] font-medium leading-normal md:text-[30px]"
        >
          {title}
          {icon}
        </h1>
        {returnTo ? (
          <Link
            href={returnTo}
            aria-label="返回相册"
            className="min-h-11 shrink-0 gap-2 rounded-lg px-3 text-sm font-normal text-foreground no-underline"
          >
            <ArrowLeft size={18} aria-hidden />
            返回
          </Link>
        ) : null}
      </div>
      {children}
    </ComponentEntrance>
  );
}
