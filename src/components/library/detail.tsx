'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefCallback,
  type ComponentProps,
} from 'react';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Modal } from '@heroui/react/modal';
import { CloseButton } from '@heroui/react/close-button';
import { Popover } from '@heroui/react/popover';
import { Skeleton } from '@heroui/react/skeleton';
import { Toolbar } from '@heroui/react/toolbar';
import { Tooltip } from '@heroui/react/tooltip';
import { toast } from '@heroui/react/toast';
import { Info } from 'lucide-react';
import { DetailMoreActions } from './detail-more-actions';
import type { LibraryDetail as Detail } from '../../server/library/detail-types';
import { DetailReadError, readDetail } from './read-detail';
import { TrashAction } from './trash-actions';
import { DetailCopy } from './detail-copy';
import { DetailPreview, initialPreview } from './detail-preview';
import { AccessDisclosure } from './access-disclosure';
import {
  bytesLabel,
  processingLabels,
  stepLabels,
  versionLabels,
} from './detail-labels';

function DetailContent({
  detail,
  onCopy,
  refreshing,
  selected,
  onSelect,
  revision,
  trash,
  onRefresh,
  mutationPending,
}: {
  detail: Detail;
  onCopy: () => void;
  refreshing: boolean;
  selected: string;
  onSelect: (kind: string) => void;
  revision: number;
  trash: ComponentProps<typeof TrashAction>;
  onRefresh: () => void;
  mutationPending: boolean;
}) {
  const [downloadMessage, setDownloadMessage] = useState('');
  const [downloading, setDownloading] = useState(false);
  const downloadRequest = useRef<AbortController | null>(null);
  useEffect(() => () => downloadRequest.current?.abort(), []);
  useEffect(() => {
    if (mutationPending) downloadRequest.current?.abort();
  }, [mutationPending]);
  const version = detail.versions.find((v) => v.kind === selected);
  async function download() {
    if (mutationPending || !version?.downloadPath || downloadRequest.current)
      return;
    const controller = new AbortController();
    downloadRequest.current = controller;
    setDownloading(true);
    setDownloadMessage('');
    try {
      // HEAD checks current access without buffering the original or counting a view.
      const response = await fetch(version.downloadPath, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      if (!response.ok)
        throw new Error(
          `下载不可用（HTTP ${response.status}），请刷新详情核对版本和存储状态。`,
        );
      const link = document.createElement('a');
      link.href = version.downloadPath;
      link.download = '';
      document.body.append(link);
      link.click();
      link.remove();
      toast.success('已发起下载', {
        description: '请在浏览器下载列表查看结果。',
      });
    } catch (error) {
      if (controller.signal.aborted) {
        setDownloadMessage('');
        return;
      }
      setDownloadMessage(
        error instanceof Error ? error.message : '下载请求失败，请重试。',
      );
    } finally {
      downloadRequest.current = null;
      setDownloading(false);
    }
  }
  return (
    <>
      {!mutationPending ? (
        <Modal.Body
          data-testid="detail-body"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4 md:py-2 md:[container-type:size]"
        >
          <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:gap-6">
            <DetailPreview
              detail={detail}
              selected={selected}
              revision={revision}
              onSelect={(kind) => {
                onSelect(kind);
                setDownloadMessage('');
              }}
            />
            <div className="grid min-w-0 content-start gap-2.5 text-sm leading-[22px] [overflow-wrap:anywhere]">
              <h2 className="text-[22px] leading-8 font-medium">
                {detail.displayName}
              </h2>
              <AccessDisclosure
                label={detail.visibility === 'private' ? '私有' : '公开'}
              >
                <p>
                  公开原图可能包含 GPS
                  和拍摄信息。复制或下载前请确认分享范围。切换预览不会改变站点默认外链。
                </p>
                {detail.visibility === 'private' ||
                detail.processingStatus !== 'ready' ? (
                  <p>
                    原图和已保存版本仍可供所有者使用；外部访客无法访问私有或未就绪图片。
                  </p>
                ) : null}
              </AccessDisclosure>
              <p>{processingLabels[detail.processingStatus]}</p>
              <div>
                <p>
                  {detail.width ?? '未知'} × {detail.height ?? '未知'} px · 原图{' '}
                  {detail.format.toUpperCase()} · {bytesLabel(detail.byteSize)}
                </p>
                <p>
                  {detail.storage.name}
                  {!detail.storage.enabled ? '（存储已停用）' : ''} ·{' '}
                  {new Date(detail.createdAt).toLocaleString('zh-CN')}
                </p>
              </div>
              <div>
                <p>
                  相册：{detail.albums.map((a) => a.name).join('、') || '无'}
                </p>
                <p>
                  标签：
                  {detail.tags.map((t) => t.displayName).join('、') || '无'}
                </p>
              </div>
              {detail.trashedAt || detail.deletionStatus ? (
                <Alert status="warning">
                  <Alert.Content>
                    <Alert.Title>图片已回收或正在删除</Alert.Title>
                    <Alert.Description>
                      此处仅显示记录，内容、复制与下载不可用。请返回图库。
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}
              {!detail.storage.enabled ? (
                <Alert status="warning">
                  <Alert.Content>
                    <Alert.Title>存储已停用</Alert.Title>
                    <Alert.Description>
                      保留图片资料，暂时不能查看、复制或下载内容。
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}
              {detail.activeJob ? (
                <p role="status">
                  当前任务：
                  {detail.activeJob.status === 'queued'
                    ? '等待执行'
                    : '执行中'}{' '}
                  · {stepLabels[detail.activeJob.step] ?? detail.activeJob.step}
                </p>
              ) : null}
              {detail.latestFailedJob ? (
                <Alert status="danger">
                  <Alert.Content>
                    <Alert.Title>
                      {detail.processingStatus === 'ready'
                        ? '最近重处理失败，已保存版本仍可使用'
                        : '最近处理任务失败'}{' '}
                      ·{' '}
                      {stepLabels[detail.latestFailedJob.step] ??
                        detail.latestFailedJob.step}
                    </Alert.Title>
                    <Alert.Description className="whitespace-pre-wrap">
                      {detail.latestFailedJob.error ?? '任务未记录错误详情'}
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}
              <div className="text-xs text-muted">
                <p>原始名称：{detail.originalName}</p>
                <p>图片 ID：{detail.id}</p>
              </div>
            </div>
          </div>
        </Modal.Body>
      ) : null}
      <Modal.Footer className="-mx-4 -mb-4 grid shrink-0 grid-cols-1 gap-2 border-t border-border bg-background px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] md:-mx-6 md:-mb-6 md:px-6 md:pb-6">
        {downloadMessage && !mutationPending ? (
          <p role="alert" className="text-sm text-danger">
            {downloadMessage}
          </p>
        ) : null}
        <Toolbar
          aria-label="图片操作"
          data-testid="detail-actions"
          className="grid w-full grid-cols-2 items-center gap-3 md:grid-cols-[minmax(0,200px)_minmax(0,200px)_44px_minmax(0,200px)] md:justify-end"
        >
          {!mutationPending ? (
            <>
              <Button
                className="h-12 w-full flex-1 rounded-lg md:max-w-50"
                isDisabled={
                  refreshing ||
                  !!detail.trashedAt ||
                  !!detail.deletionStatus ||
                  !detail.storage.enabled
                }
                onPress={onCopy}
              >
                复制链接
              </Button>
              <Button
                variant="outline"
                className="hidden h-12 w-full flex-1 rounded-lg md:flex md:max-w-50"
                isDisabled={!version?.downloadPath || downloading || refreshing}
                onPress={() => {
                  void download();
                }}
              >
                {downloading
                  ? '正在检查下载…'
                  : `下载${version ? versionLabels[version.kind] : '当前版本'}`}
              </Button>
            </>
          ) : null}
          <Popover>
            <Button
              variant="outline"
              isIconOnly
              aria-label="下载说明"
              className="hidden size-11 shrink-0 rounded-lg md:flex"
            >
              <Info size={18} aria-hidden />
            </Button>
            <Popover.Content className="max-w-80 rounded-xl border border-border bg-surface p-0">
              <Popover.Dialog aria-label="下载说明" className="p-4 text-sm">
                原图可能包含 GPS 和拍摄信息。下载前请确认分享范围。
              </Popover.Dialog>
            </Popover.Content>
          </Popover>
          <div className="min-w-0 flex-1 md:max-w-50">
            <DetailMoreActions
              trash={trash}
              refreshing={refreshing}
              onRefresh={onRefresh}
              download={{
                label: downloading
                  ? '正在检查下载…'
                  : `下载${version ? versionLabels[version.kind] : '当前版本'}`,
                isDisabled: !version?.downloadPath || downloading || refreshing,
                onDownload: () => {
                  void download();
                },
              }}
            />
          </div>
        </Toolbar>
      </Modal.Footer>
    </>
  );
}

export function LibraryDetail({
  imageId,
  client,
  onClose,
  dialogRef,
  onTrashed,
  returnTo,
}: {
  imageId: string;
  returnTo: string;
  client: QueryClient;
  onClose: () => void;
  dialogRef: RefCallback<HTMLElement>;
  onTrashed: (detail: Detail) => void;
}) {
  const [unavailable, setUnavailable] = useState<401 | 404 | null>(null);
  const [mutationPending, setMutationPending] = useState(false);
  const onMutationPending = useCallback(
    (pending: boolean) => {
      if (pending)
        void client.cancelQueries({
          queryKey: ['library-detail', imageId],
          exact: true,
        });
      setMutationPending(pending);
    },
    [client, imageId],
  );
  const [copyOpen, setCopyOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [previewRevision, setPreviewRevision] = useState(0);
  const query = useQuery(
    {
      queryKey: ['library-detail', imageId],
      queryFn: ({ signal }) => readDetail(imageId, signal),
      enabled: !mutationPending,
      retry: false,
      networkMode: 'always',
      staleTime: 0,
      refetchOnWindowFocus: true,
      refetchInterval: (query) => (query.state.data?.activeJob ? 2000 : false),
    },
    client,
  );
  async function refreshDetail() {
    const result = await query.refetch();
    if (result.isSuccess) setPreviewRevision((value) => value + 1);
  }
  const expired =
    unavailable === 401 ||
    (query.error instanceof DetailReadError && query.error.status === 401);
  useEffect(() => {
    if (!expired) return;
    client.clear();
    window.location.replace(
      `/login?reason=expired&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }, [client, expired, returnTo]);
  useEffect(
    () => () => {
      client.removeQueries({ queryKey: ['library-detail', imageId] });
    },
    [client, imageId],
  );
  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Container
        placement="center"
        scroll="inside"
        className="w-full p-0 sm:w-full sm:p-0 md:p-6"
      >
        <Modal.Dialog
          aria-label="图片详情"
          data-testid="library-detail"
          className="h-(--visual-viewport-height) max-h-full min-h-0 max-w-none rounded-none bg-background p-4 pt-[max(16px,env(safe-area-inset-top))] md:h-160 md:max-w-260 md:rounded-3xl md:p-6"
        >
          <Modal.Header className="flex shrink-0 flex-row items-center justify-between gap-3">
            <div ref={dialogRef}>
              <Modal.Heading className="text-lg">图片详情</Modal.Heading>
            </div>
            <Tooltip>
              <CloseButton
                aria-label="关闭图片详情"
                className="size-11 rounded-lg border border-border"
                onPress={onClose}
              />
              <Tooltip.Content>关闭</Tooltip.Content>
            </Tooltip>
          </Modal.Header>
          {unavailable === 404 ? (
            <p role="alert" className="py-6">
              图片记录已不存在，无法回收。请返回图库。
            </p>
          ) : null}
          {query.isPending ? (
            <Modal.Body>
              <span role="status" className="sr-only">
                正在读取图片详情…
              </span>
              <div
                aria-hidden
                className="grid gap-6 py-4 md:grid-cols-[1.3fr_1fr]"
              >
                <Skeleton className="h-80 w-full rounded-xl" />
                <div className="grid content-start gap-4">
                  <Skeleton className="h-8 w-3/4 rounded-lg" />
                  <Skeleton className="h-44 w-full rounded-lg" />
                </div>
              </div>
            </Modal.Body>
          ) : null}
          {query.isError ? (
            <Alert status="danger" className="my-4">
              <Alert.Content>
                <Alert.Title>图片详情读取失败</Alert.Title>
                <Alert.Description>
                  {query.error.message}{' '}
                  {query.data ? '暂不展示旧内容，请刷新详情。' : ''}
                </Alert.Description>
                <Button
                  variant="outline"
                  className="mt-3 min-h-11"
                  isDisabled={query.isFetching}
                  onPress={() => {
                    void refreshDetail();
                  }}
                >
                  刷新详情
                </Button>
              </Alert.Content>
            </Alert>
          ) : null}
          {query.data && !query.isError && !expired && !unavailable ? (
            <DetailContent
              detail={query.data}
              selected={selected ?? initialPreview(query.data)}
              onSelect={setSelected}
              revision={previewRevision}
              refreshing={query.isFetching || mutationPending}
              mutationPending={mutationPending}
              trash={{
                record: query.data,
                operation: 'trash',
                onPending: onMutationPending,
                onUnavailable: (status) => {
                  setUnavailable(status);
                  if (status === 404)
                    void client.invalidateQueries({ queryKey: ['library'] });
                },
                onVerified: (record) =>
                  client.setQueryData(['library-detail', imageId], record),
                onComplete: onTrashed,
              }}
              onRefresh={() => {
                void refreshDetail();
              }}
              onCopy={() => {
                setCopyOpen(true);
                void query.refetch();
              }}
            />
          ) : null}
          {copyOpen && query.data && !expired ? (
            <DetailCopy
              detail={query.data}
              pending={query.isFetching}
              error={query.error?.message ?? null}
              onClose={() => setCopyOpen(false)}
              onRetry={() => {
                void query.refetch();
              }}
            />
          ) : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
