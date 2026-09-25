'use client';

import { useEffect, useRef, useState, type RefCallback } from 'react';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Modal } from '@heroui/react/modal';
import type { LibraryDetail as Detail } from '../../server/library/detail-types';
import { DetailReadError, readDetail } from './read-detail';
import { TrashAction } from './trash-actions';
import { DetailCopy } from './detail-copy';
import { DetailPreview, initialPreview } from './detail-preview';
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
}: {
  detail: Detail;
  onCopy: () => void;
  refreshing: boolean;
  selected: string;
  onSelect: (kind: string) => void;
  revision: number;
}) {
  const [downloadMessage, setDownloadMessage] = useState('');
  const [downloadError, setDownloadError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const downloadRequest = useRef<AbortController | null>(null);
  useEffect(() => () => downloadRequest.current?.abort(), []);
  const version = detail.versions.find((v) => v.kind === selected);
  async function download() {
    if (!version?.downloadPath || downloadRequest.current) return;
    const controller = new AbortController();
    downloadRequest.current = controller;
    setDownloading(true);
    setDownloadError(false);
    setDownloadMessage('正在检查下载…');
    try {
      // HEAD checks current access without buffering the original or counting a view.
      const response = await fetch(version.downloadPath, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });
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
      setDownloadMessage('已发起下载，请在浏览器下载列表查看结果。');
    } catch (error) {
      if (controller.signal.aborted) return;
      setDownloadError(true);
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
      <Modal.Body
        data-testid="detail-body"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4 md:py-2"
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
          <div className="grid min-w-0 content-start gap-3 text-sm [overflow-wrap:anywhere]">
            <h2 className="text-[22px] font-medium">{detail.displayName}</h2>
            <p>
              {detail.visibility === 'private' ? '私有' : '公开'} ·{' '}
              {processingLabels[detail.processingStatus]}
            </p>
            <p>
              {detail.width ?? '未知'} × {detail.height ?? '未知'} px · 原图{' '}
              {detail.format.toUpperCase()} · {bytesLabel(detail.byteSize)}
            </p>
            <p>
              {detail.storage.name}
              {!detail.storage.enabled ? '（存储已停用）' : ''} ·{' '}
              {new Date(detail.createdAt).toLocaleString('zh-CN')}
            </p>
            <p>原始名称：{detail.originalName}</p>
            <p>图片 ID：{detail.id}</p>
            <p>相册：{detail.albums.map((a) => a.name).join('、') || '无'}</p>
            <p>
              标签：{detail.tags.map((t) => t.displayName).join('、') || '无'}
            </p>
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
                  : '执行中'} ·{' '}
                {stepLabels[detail.activeJob.step] ?? detail.activeJob.step}
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
            <div className="grid gap-2 rounded-lg bg-secondary p-3">
              <p>公开原图可能包含 GPS 和拍摄信息。</p>
              <p>切换预览不会改变站点默认外链。</p>
              {detail.visibility === 'private' ||
              detail.processingStatus !== 'ready' ? (
                <p>
                  原图和已保存版本仍可供所有者使用；外部访客无法访问私有或未就绪图片。
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer className="grid shrink-0 gap-2 border-t border-border pt-3 pb-[max(0px,env(safe-area-inset-bottom))]">
        {downloadMessage ? (
          <p
            role={downloadError ? 'alert' : 'status'}
            className={downloadError ? 'text-sm text-danger' : 'text-sm'}
          >
            {downloadMessage}
          </p>
        ) : null}
        <div className="flex gap-3 md:justify-end">
          <Button
            className="min-h-12 flex-1 rounded-lg md:max-w-50"
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
            className="min-h-12 flex-1 rounded-lg md:max-w-50"
            isDisabled={!version?.downloadPath || downloading || refreshing}
            onPress={() => {
              void download();
            }}
          >
            {downloading
              ? '正在检查下载…'
              : `下载${version ? versionLabels[version.kind] : '当前版本'}`}
          </Button>
        </div>
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
}: {
  imageId: string;
  client: QueryClient;
  onClose: () => void;
  dialogRef: RefCallback<HTMLElement>;
  onTrashed: (detail: Detail) => void;
}) {
  const [unavailable, setUnavailable] = useState<401 | 404 | null>(null);
  const [mutationPending, setMutationPending] = useState(false);
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
      `/login?reason=expired&returnTo=${encodeURIComponent(`/library?${new URLSearchParams({ image: imageId })}`)}`,
    );
  }, [client, expired, imageId]);
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
            <div className="flex gap-2">
              <Button
                variant="tertiary"
                className="min-h-11 rounded-lg"
                isDisabled={query.isFetching || mutationPending}
                onPress={() => {
                  void refreshDetail();
                }}
              >
                刷新详情
              </Button>
              <Button
                variant="outline"
                className="min-h-11 rounded-lg"
                onPress={onClose}
              >
                返回图库
              </Button>
            </div>
          </Modal.Header>
          {unavailable === 404 ? (
            <p role="alert" className="py-6">
              图片记录已不存在，无法回收。请返回图库。
            </p>
          ) : null}
          {query.isPending ? (
            <Modal.Body>
              <p role="status" className="py-12">
                正在读取图片详情…
              </p>
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
              </Alert.Content>
            </Alert>
          ) : null}
          {query.data && !query.isError && !expired && !unavailable ? (
            <TrashAction
              record={query.data}
              operation="trash"
              onPending={setMutationPending}
              onUnavailable={(status) => {
                setUnavailable(status);
                if (status === 404)
                  void client.invalidateQueries({ queryKey: ['library'] });
              }}
              onVerified={(record) =>
                client.setQueryData(['library-detail', imageId], record)
              }
              onComplete={onTrashed}
            />
          ) : null}
          {query.data &&
          !query.isError &&
          !expired &&
          !unavailable &&
          !mutationPending ? (
            <DetailContent
              detail={query.data}
              selected={selected ?? initialPreview(query.data)}
              onSelect={setSelected}
              revision={previewRevision}
              refreshing={query.isFetching}
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
