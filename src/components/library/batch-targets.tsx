'use client';

import { useEffect, useState } from 'react';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { Checkbox } from '@heroui/react/checkbox';
import { Input } from '@heroui/react/input';
import { Check, ImageOff, Search } from 'lucide-react';
import {
  albumRequest,
  AlbumRequestError,
  type AlbumPage,
} from '../../app/albums/api';
import {
  tagRequest,
  TagRequestError,
  type Tag,
  type TagPage,
} from '../../app/tags/api';
import { TagTargetCreate } from './tag-target-create';
import { useTagTargetCreate } from './use-tag-target-create';
import type { LibraryBatch } from './use-library-batch';

export function BatchThumbnail({
  url,
  size = 64,
  className,
}: {
  url: string | null;
  size?: 48 | 64;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden bg-default ${className ?? `rounded-xl ${size === 48 ? 'size-12' : 'size-16'}`}`}
    >
      {url && !failed ? (
        <img // eslint-disable-line @next/next/no-img-element
          src={url}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <ImageOff size={20} aria-label="暂无可读缩略图" />
      )}
    </span>
  );
}

export function useBatchTargets({
  batch,
  client,
}: {
  batch: LibraryBatch;
  client: QueryClient;
}) {
  const workspace = batch.workspace!;
  const albums = workspace.action.endsWith('albums');
  const noun = albums ? '相册' : '标签';
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const ids =
    workspace.command && 'albumIds' in workspace.command
      ? workspace.command.albumIds
      : workspace.command && 'tagIds' in workspace.command
        ? workspace.command.tagIds
        : [];
  const list = useQuery<AlbumPage | TagPage>(
    {
      queryKey: ['batch-targets', albums, q, page],
      enabled: batch.visible,
      queryFn: ({ signal }) => {
        const params = new URLSearchParams({
          q,
          page: String(page),
          pageSize: '20',
        });
        return albums
          ? albumRequest<AlbumPage>(`/api/albums?${params}`, { signal })
          : tagRequest<TagPage>(`/api/tags?${params}`, { signal });
      },
      retry: false,
      refetchOnWindowFocus: false,
      networkMode: 'always',
    },
    client,
  );
  const create = useTagTargetCreate({
    available:
      list.data?.items.filter((item): item is Tag => 'displayName' in item) ??
      [],
    disabled: albums || batch.pending || workspace.phase !== 'choose',
    onExpire: batch.onExpire,
    onSelect: (tag) => {
      choose([...new Set([...ids, tag.id])]);
      setQ(tag.displayName);
      setPage(1);
      void client.invalidateQueries({ queryKey: ['batch-targets', false] });
    },
  });
  const locked =
    batch.pending ||
    workspace.phase !== 'choose' ||
    create.pending ||
    create.unknown;
  const { setTargetReady } = batch;
  useEffect(() => {
    setTargetReady(
      list.isSuccess &&
        !list.isFetching &&
        !list.error &&
        !create.pending &&
        !create.unknown,
    );
  }, [
    list.isSuccess,
    list.isFetching,
    list.error,
    create.pending,
    create.unknown,
    setTargetReady,
  ]);
  useEffect(() => {
    if (
      (list.error instanceof AlbumRequestError ||
        list.error instanceof TagRequestError) &&
      list.error.status === 401
    )
      batch.onExpire();
  }, [list.error, batch]);
  function choose(next: string[]) {
    const names = new Map([
      ...(list.data?.items ?? []).flatMap((item) =>
        'name' in item ? [[item.id, item.name] as const] : [],
      ),
      ...workspace.albumTargets.map(({ id, name }) => [id, name] as const),
    ]);
    batch.choose(
      !next.length
        ? null
        : albums
          ? {
              type: workspace.action as 'add-albums' | 'remove-albums',
              albumIds: next,
            }
          : {
              type: workspace.action as 'add-tags' | 'remove-tags',
              tagIds: next,
            },
      albums ? next.map((id) => ({ id, name: names.get(id)! })) : [],
    );
  }
  return {
    workspace,
    albums,
    noun,
    q,
    setQ,
    page,
    setPage,
    ids,
    list,
    create,
    locked,
    choose,
    createDisabled: batch.pending || workspace.phase !== 'choose',
  };
}

export function BatchTargets(props: {
  batch: LibraryBatch;
  client: QueryClient;
}) {
  const targets = useBatchTargets(props);
  return <BatchTargetsContent targets={targets} />;
}

export function BatchTargetsContent({
  targets,
}: {
  targets: ReturnType<typeof useBatchTargets>;
}) {
  const {
    workspace,
    albums,
    noun,
    q,
    setQ,
    page,
    setPage,
    ids,
    list,
    create,
    locked,
    choose,
    createDisabled,
  } = targets;
  return (
    <div
      className={albums ? 'contents' : 'flex min-h-65 flex-1 flex-col gap-3'}
    >
      {albums ? (
        <p role="status" className="shrink-0 text-sm text-muted">
          已选 {workspace.items.length} 张图片 · {ids.length} 个{noun}
        </p>
      ) : null}
      <div
        className={
          albums
            ? 'flex min-w-0 shrink-0 items-center gap-3'
            : '-mx-5 flex min-w-0 shrink-0 items-center gap-3 border-b border-border px-5 pb-4'
        }
      >
        <div className="relative min-w-0 flex-1">
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute left-3 top-3.5 text-muted"
          />
          <Input
            aria-label={`搜索目标${noun}`}
            disabled={locked}
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            className="h-11 w-full min-w-0 rounded-lg border border-border bg-background pl-10 text-base md:text-sm"
            placeholder={`搜索${noun}`}
          />
        </div>
      </div>
      <div
        className={
          albums
            ? 'contents'
            : 'min-h-14 flex-1 overflow-y-auto overscroll-contain'
        }
      >
        {list.isPending ? <p role="status">正在读取{noun}目标…</p> : null}
        {list.error ? (
          <div
            role="alert"
            className="grid gap-3 rounded-lg border border-border p-3"
          >
            <p className="text-sm">
              目标读取失败：{list.error.message}。已有目标选择已保留。
            </p>
            <Button
              variant="outline"
              className="h-11 w-fit rounded-lg"
              onPress={() => void list.refetch()}
            >
              重试读取目标
            </Button>
          </div>
        ) : null}
        {list.isSuccess && !list.data.items.length ? (
          <p role="status" className="py-5 text-center text-sm text-muted">
            {q ? '没有匹配目标，请修改搜索条件。' : `还没有${noun}目标。`}
          </p>
        ) : null}
        <div
          data-testid="batch-target-grid"
          className={albums ? 'grid gap-2' : 'grid divide-y divide-border'}
          aria-label={`${noun}目标`}
        >
          {list.data?.items.map((target) => (
            <Checkbox
              key={target.id}
              data-target-id={target.id}
              aria-label={`选择${noun}：${'name' in target ? `${target.name} · ${target.id}` : target.displayName}`}
              isSelected={ids.includes(target.id)}
              isDisabled={locked || !!list.error || list.isFetching}
              onChange={(selected) =>
                choose(
                  selected
                    ? [...ids, target.id]
                    : ids.filter((id) => id !== target.id),
                )
              }
              className={
                albums
                  ? 'w-full max-w-none rounded-lg border border-border bg-background p-0 data-[selected=true]:bg-default dark:bg-surface'
                  : 'w-full max-w-none rounded-none p-0'
              }
            >
              <Checkbox.Content
                className={`flex w-full min-w-0 items-center gap-3 ${albums ? 'min-h-16 p-3' : 'min-h-14 py-3'}`}
              >
                <Checkbox.Control
                  className={`size-4 shrink-0 border shadow-none ${ids.includes(target.id) ? 'border-transparent' : 'border-border bg-background'}`}
                >
                  <Checkbox.Indicator>
                    <Check size={16} aria-hidden />
                  </Checkbox.Indicator>
                </Checkbox.Control>
                {'cover' in target ? (
                  <BatchThumbnail
                    key={target.cover.thumbnailUrl}
                    url={target.cover.thumbnailUrl}
                    size={48}
                  />
                ) : null}
                <span
                  className={
                    albums
                      ? 'grid min-w-0 flex-1 gap-0.5 [overflow-wrap:anywhere]'
                      : 'flex min-w-0 flex-1 items-center justify-between gap-3 [overflow-wrap:anywhere]'
                  }
                >
                  <span className="text-sm font-medium">
                    {'name' in target ? target.name : target.displayName}
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {albums ? `${target.id} · ` : ''}
                    {target.imageCount} 张图片
                  </span>
                </span>
              </Checkbox.Content>
            </Checkbox>
          ))}
        </div>
        {list.data && list.data.total > 20 ? (
          <div
            className="flex items-center justify-between gap-3"
            aria-label="目标分页"
          >
            <Button
              variant="outline"
              className="h-11 rounded-lg"
              isDisabled={locked || page === 1 || list.isFetching}
              onPress={() => setPage(page - 1)}
            >
              上一页目标
            </Button>
            <span className="text-xs">
              {page}/{Math.ceil(list.data.total / 20)}
            </span>
            <Button
              variant="outline"
              className="h-11 rounded-lg"
              isDisabled={
                locked || page * 20 >= list.data.total || list.isFetching
              }
              onPress={() => setPage(page + 1)}
            >
              下一页目标
            </Button>
          </div>
        ) : null}
      </div>
      {!albums && workspace.action === 'add-tags' ? (
        <TagTargetCreate create={create} disabled={createDisabled} />
      ) : null}
    </div>
  );
}
