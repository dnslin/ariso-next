'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { Pagination } from '@heroui/react/pagination';
import { Spinner } from '@heroui/react/spinner';
import { ArrowLeft, Images } from 'lucide-react';
import { parseLibraryLocation } from '../library/query-state';
import { LibraryLoading } from '../library/library-loading';
import {
  LibraryReadError,
  readLibraryResult,
} from '../library/use-library-query';
import { albumRequest, AlbumRequestError, albumUrl, type Album } from './api';
import { CoverChoice } from './cover-choice';
import { CoverResult, type CoverOutcome } from './cover-result';

export function AlbumCoverPicker({
  album,
  isOpen,
  onCancel,
  onComplete,
  onExpire,
  renderWorkspace,
}: {
  album: Album;
  isOpen: boolean;
  onCancel: () => void;
  onComplete: (album: Album) => void;
  onExpire: () => void;
  renderWorkspace: (content: ReactNode, footer: ReactNode) => ReactNode;
}) {
  const [client] = useState(() => new QueryClient());
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState(false);
  const [choice, setChoice] = useState<string | null | undefined>();
  const [choiceName, setChoiceName] = useState('自动选择');
  const [outcome, setOutcome] = useState<CoverOutcome>({ kind: 'idle' });
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const latestAlbum = useRef(album);
  const choiceTrigger = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = isOpen;
    if (isOpen) heading.current?.focus();
    return () => {
      mounted.current = false;
      request.current?.abort();
      request.current = null;
      busy.current = false;
      client.clear();
    };
  }, [client, isOpen]);
  useEffect(() => {
    if (!isOpen) latestAlbum.current = album;
  }, [album, isOpen]);
  const filters = parseLibraryLocation(
    new URLSearchParams({ pageSize: '40' }),
    album.id,
  ).filters;
  const list = useQuery(
    {
      queryKey: ['album-cover-choices', album.id, page],
      enabled: isOpen,
      queryFn: ({ signal }) => readLibraryResult(filters, { page }, signal),
      retry: false,
      networkMode: 'always',
    },
    client,
  );
  useEffect(() => {
    if (
      isOpen &&
      list.error instanceof LibraryReadError &&
      list.error.status === 401
    )
      onExpire();
  }, [isOpen, list.error, onExpire]);
  const blocked =
    pending ||
    outcome.kind === 'unknown' ||
    outcome.kind === 'missing' ||
    outcome.kind === 'saved';
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 40));

  function handleKnownError(error: unknown) {
    if (!(error instanceof AlbumRequestError)) return false;
    if (error.status === 401) {
      onExpire();
      return true;
    }
    if (error.status === 404) {
      setOutcome({ kind: 'missing', message: '相册已不存在，无法保存封面。' });
      return true;
    }
    if (error.status < 500) {
      setOutcome({
        kind: 'failed',
        message: `${error.message}。封面选择已保留，请刷新成员后重新选择。`,
      });
      return true;
    }
    return false;
  }

  async function verify(imageId: string | null, signal: AbortSignal) {
    try {
      const current = await albumRequest<{ album: Album }>(albumUrl(album.id), {
        signal,
      });
      if (!mounted.current || signal.aborted) return;
      latestAlbum.current = current.album;
      if (current.album.cover.preferredCoverImageId === imageId) {
        setOutcome({ kind: 'saved', album: current.album });
      } else {
        setOutcome({
          kind: 'failed',
          message:
            '已重新读取相册，本次封面选择尚未保存。选择已保留，可重试保存。',
        });
      }
    } catch (error) {
      if (!mounted.current || signal.aborted) return;
      if (handleKnownError(error)) return;
      setOutcome({
        kind: 'unknown',
        message: `暂时无法核对封面结果。${error instanceof Error ? error.message : '请稍后重新核对。'} 请勿重复提交。`,
      });
    }
  }

  async function choose(imageId: string | null) {
    if (busy.current || blocked) return;
    busy.current = true;
    const controller = new AbortController();
    request.current = controller;
    choiceTrigger.current = document.activeElement as HTMLElement | null;
    setChoice(imageId);
    setChoiceName(
      imageId === null
        ? '自动选择'
        : (list.data?.items.find((item) => item.id === imageId)?.displayName ??
            choiceName),
    );
    setPending(true);
    setOutcome({ kind: 'idle' });
    try {
      const result = await albumRequest<{ album: Album }>(
        `${albumUrl(album.id)}/cover`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageId }),
          signal: controller.signal,
        },
      );
      if (!mounted.current || controller.signal.aborted) return;
      if (!result.album) throw new Error('服务器响应未包含封面保存结果');
      latestAlbum.current = result.album;
      setOutcome({ kind: 'saved', album: result.album });
    } catch (error) {
      if (!mounted.current || controller.signal.aborted) return;
      if (handleKnownError(error)) return;
      setOutcome({
        kind: 'unknown',
        message: '未收到可确认的封面结果，正在重新读取并核对。请勿重复提交。',
      });
      await verify(imageId, controller.signal);
    } finally {
      if (request.current === controller) {
        busy.current = false;
        request.current = null;
        if (mounted.current) setPending(false);
      }
    }
  }

  async function check() {
    if (busy.current || choice === undefined) return;
    busy.current = true;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    try {
      await verify(choice, controller.signal);
    } finally {
      if (request.current === controller) {
        busy.current = false;
        request.current = null;
        if (mounted.current) setPending(false);
      }
    }
  }

  function close(saved?: Album) {
    setPage(1);
    setChoice(undefined);
    setChoiceName('自动选择');
    setOutcome({ kind: 'idle' });
    setPending(false);
    if (saved) onComplete(saved);
    else onCancel();
  }

  function cancel() {
    close(latestAlbum.current !== album ? latestAlbum.current : undefined);
  }

  function resetOutcome() {
    setOutcome({ kind: 'idle' });
    requestAnimationFrame(() => choiceTrigger.current?.focus());
  }

  const footer =
    list.data && list.data.total > 40 ? (
      <div className="flex w-full flex-wrap items-center gap-3 text-sm">
        <p>共 {list.data.total} 张图片</p>
        <Pagination
          aria-label="封面图片分页"
          className="ml-auto min-w-0 flex-1 md:max-w-96"
        >
          <Pagination.Content className="w-full gap-2">
            <Pagination.Item className="flex-1">
              <Pagination.Previous
                className="h-11 w-full min-w-0 rounded-lg border border-border px-3 font-normal"
                isDisabled={page <= 1 || list.isFetching || pending}
                onPress={() => setPage(page - 1)}
              >
                上一页
              </Pagination.Previous>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Summary className="text-xs">
                {page}/{pages}
              </Pagination.Summary>
            </Pagination.Item>
            <Pagination.Item className="flex-1">
              <Pagination.Next
                className="h-11 w-full min-w-0 rounded-lg border border-border px-3 font-normal"
                isDisabled={page >= pages || list.isFetching || pending}
                onPress={() => setPage(page + 1)}
              >
                下一页
              </Pagination.Next>
            </Pagination.Item>
          </Pagination.Content>
        </Pagination>
      </div>
    ) : null;

  if (!isOpen) return renderWorkspace(null, null);

  return renderWorkspace(
    <section
      className="grid min-w-0 grid-cols-1 gap-4"
      data-testid="album-cover-picker"
    >
      <Link
        href="/albums"
        isDisabled={pending}
        className="flex h-11 w-[150px] items-center justify-center gap-1 rounded-lg px-3 text-sm"
      >
        <ArrowLeft size={14} aria-hidden />
        返回相册列表
      </Link>
      <h1
        ref={heading}
        tabIndex={-1}
        className="text-[26px] font-medium leading-normal outline-none md:text-[30px]"
      >
        设置相册封面
      </h1>
      <p className="text-sm leading-normal text-muted">
        只有本相册中的公开图片可以作为封面。
      </p>
      <div className="flex w-full max-w-[520px] gap-2.5">
        <Button
          className="h-12 min-w-0 flex-1 rounded-lg font-normal"
          isDisabled={blocked}
          onPress={() => void choose(null)}
        >
          自动选择
        </Button>
        <Button
          variant="outline"
          className="h-12 min-w-0 flex-1 rounded-lg border border-border bg-background font-normal"
          isDisabled={pending}
          onPress={cancel}
        >
          取消
        </Button>
      </div>
      <Alert className="rounded-lg bg-default px-3 py-2.5 text-foreground shadow-none">
        <Alert.Content>
          <Alert.Description className="text-[13px] leading-normal text-foreground">
            自动封面使用整本相册中最近加入的公开图片。
          </Alert.Description>
        </Alert.Content>
      </Alert>
      {pending ? (
        <p role="status" className="flex items-center gap-2 text-sm">
          <Spinner size="sm" />
          {outcome.kind === 'unknown' ? '正在核对封面结果…' : '正在保存封面…'}
        </p>
      ) : null}
      <CoverResult
        album={album}
        outcome={outcome}
        choiceName={choiceName}
        pending={pending}
        onClose={() => {
          if (pending) return;
          if (outcome.kind === 'saved') close(outcome.album);
          else if (outcome.kind === 'unknown' || outcome.kind === 'missing')
            cancel();
          else resetOutcome();
        }}
        onReset={resetOutcome}
        onRetry={() => {
          if (choice !== undefined) void choose(choice);
        }}
        onCheck={() => void check()}
      />
      {list.error ? (
        <Alert status="danger" role="alert" data-testid="cover-list-error">
          <Alert.Content>
            <Alert.Title>封面图片读取失败</Alert.Title>
            <Alert.Description>{list.error.message}</Alert.Description>
            <Button
              variant="outline"
              className="mt-3"
              isDisabled={list.isFetching}
              onPress={() => void list.refetch()}
            >
              重试读取图片
            </Button>
          </Alert.Content>
        </Alert>
      ) : list.isPending ? (
        <LibraryLoading />
      ) : !list.data?.items.length ? (
        <div
          role="status"
          className="grid justify-items-center gap-3 py-16 text-center"
        >
          <Images size={42} aria-hidden />
          <h2 className="text-xl font-medium">相册暂无图片</h2>
          <p className="text-sm text-muted">
            加入公开图片后可选择封面。自动选择会清除手动封面。
          </p>
        </div>
      ) : (
        <div
          className="grid grid-cols-2 items-start gap-3 min-[768px]:grid-cols-3 min-[1200px]:grid-cols-4 min-[1200px]:gap-5"
          aria-label="相册封面图片"
        >
          {list.data.items.map((item) => (
            <CoverChoice
              key={item.id}
              item={item}
              selected={choice === item.id}
              disabled={blocked || list.isFetching}
              onChoose={(id) => void choose(id)}
            />
          ))}
        </div>
      )}
    </section>,
    footer,
  );
}
