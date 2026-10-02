'use client';

import { useEffect, useState } from 'react';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { Checkbox } from '@heroui/react/checkbox';
import { Input } from '@heroui/react/input';
import { Check, ImageOff } from 'lucide-react';
import {
  albumRequest,
  AlbumRequestError,
  albumUrl,
  type AlbumPage,
  type Album,
} from '../../app/albums/api';
import { tagRequest, TagRequestError, type TagPage } from '../../app/tags/api';
import { UploadCreateTag } from '../upload/create-tag';
import type { LibraryBatch } from './use-library-batch';

export function BatchThumbnail({
  url,
  size = 64,
}: {
  url: string | null;
  size?: 48 | 64;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-default ${size === 48 ? 'size-12' : 'size-16'}`}
    >
      {url && !failed ? (
        <img // eslint-disable-line @next/next/no-img-element
          src={url}
          alt=""
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

export function BatchTargets({
  batch,
  client,
  currentAlbumId,
  timeZone,
}: {
  batch: LibraryBatch;
  client: QueryClient;
  currentAlbumId?: string;
  timeZone?: string;
}) {
  const workspace = batch.workspace!;
  const albums = workspace.action.endsWith('albums');
  const noun = albums ? '相册' : '标签';
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const ids =
    workspace.command && 'albumIds' in workspace.command
      ? workspace.command.albumIds
      : workspace.command && 'tagIds' in workspace.command
        ? workspace.command.tagIds
        : [];
  const list = useQuery<AlbumPage | TagPage>(
    {
      queryKey: ['batch-targets', albums, q, page],
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
  const current = useQuery(
    {
      queryKey: ['batch-current-album', currentAlbumId],
      queryFn: ({ signal }) =>
        albumRequest<{ album: Album }>(albumUrl(currentAlbumId!), { signal }),
      enabled: workspace.action === 'remove-albums' && !!currentAlbumId,
      retry: false,
      refetchOnWindowFocus: false,
      networkMode: 'always',
    },
    client,
  );
  const error = list.error ?? current.error;
  const { setTargetReady } = batch;
  useEffect(() => {
    setTargetReady(
      list.isSuccess &&
        !list.isFetching &&
        !error &&
        (!currentAlbumId ||
          workspace.action !== 'remove-albums' ||
          current.isSuccess),
    );
  }, [
    list.isSuccess,
    list.isFetching,
    error,
    currentAlbumId,
    workspace.action,
    current.isSuccess,
    setTargetReady,
  ]);
  useEffect(() => {
    if (
      (error instanceof AlbumRequestError ||
        error instanceof TagRequestError) &&
      error.status === 401
    )
      batch.onExpire();
  }, [error, batch]);
  const targets = [...(list.data?.items ?? [])];
  if (
    !q &&
    current.data &&
    !targets.some((target) => target.id === current.data!.album.id)
  )
    targets.unshift(current.data.album);
  function choose(next: string[]) {
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
    );
  }
  return (
    <>
      <p className="text-sm text-muted">
        本次已选{workspace.items.length}张 ·{' '}
        {ids.length ? `已选${ids.length}个目标` : '尚未选择目标'}
      </p>
      <p>按{noun}ID区分同名目标</p>
      <div className="flex min-w-0 gap-3">
        <Input
          aria-label={`搜索目标${noun}`}
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
          className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background text-base md:text-sm"
          placeholder={`搜索${noun}`}
        />
        {!albums && workspace.action === 'add-tags' ? (
          <Button
            variant="outline"
            className="h-11 shrink-0 rounded-lg font-normal"
            onPress={() => setCreating(true)}
          >
            新建标签
          </Button>
        ) : null}
      </div>
      {list.isPending ? <p role="status">正在读取{noun}目标…</p> : null}
      {error ? (
        <div
          role="alert"
          className="grid gap-3 rounded-xl border border-border p-3"
        >
          <p>目标读取失败：{error.message}。已有目标选择已保留。</p>
          <Button
            variant="outline"
            className="h-11 w-fit rounded-lg"
            onPress={() => {
              void list.refetch();
              if (current.error) void current.refetch();
            }}
          >
            重试读取目标
          </Button>
        </div>
      ) : null}
      {list.isSuccess && !targets.length ? (
        <p role="status">
          {q ? '没有匹配目标，请修改搜索条件。' : `还没有${noun}目标。`}
        </p>
      ) : null}
      <div className="grid gap-3" aria-label={`${noun}目标`}>
        {targets.map((target) => (
          <Checkbox
            key={target.id}
            data-target-id={target.id}
            aria-label={`选择${noun}：${'name' in target ? target.name : target.displayName} · ${target.id}`}
            isSelected={ids.includes(target.id)}
            onChange={(selected) =>
              choose(
                selected
                  ? [...ids, target.id]
                  : ids.filter((id) => id !== target.id),
              )
            }
            className="w-full max-w-none rounded-xl border border-border bg-background p-0 data-[selected=true]:bg-default"
          >
            <Checkbox.Content className="flex min-h-18 w-full min-w-0 items-start gap-3 p-3">
              {'cover' in target ? (
                <BatchThumbnail
                  key={target.cover.thumbnailUrl}
                  url={target.cover.thumbnailUrl}
                  size={48}
                />
              ) : null}
              <span className="flex min-w-0 flex-1 items-start gap-2">
                <Checkbox.Control
                  className={`mt-1 size-4 shrink-0 rounded-none border shadow-none before:bg-transparent! ${ids.includes(target.id) ? 'border-transparent! bg-transparent!' : 'border-foreground bg-background'}`}
                >
                  <Checkbox.Indicator className="size-4 text-foreground">
                    {({ isSelected }) =>
                      isSelected ? <Check size={16} aria-hidden /> : null
                    }
                  </Checkbox.Indicator>
                </Checkbox.Control>
                <span className="grid min-w-0 gap-0.5 [overflow-wrap:anywhere]">
                  <span className="text-base font-normal">
                    {'name' in target ? target.name : target.displayName} ·{' '}
                    {target.id}
                  </span>
                  <span className="text-xs text-muted">
                    {target.imageCount}张 · 创建于
                    {new Date(target.createdAt).toLocaleDateString('zh-CN', {
                      timeZone,
                    })}
                  </span>
                </span>
              </span>
            </Checkbox.Content>
          </Checkbox>
        ))}
      </div>
      {list.data && list.data.total > 20 ? (
        <div className="flex items-center gap-3" aria-label="目标分页">
          <Button
            variant="outline"
            className="h-11 rounded-lg"
            isDisabled={page === 1 || list.isFetching}
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
            isDisabled={page * 20 >= list.data.total || list.isFetching}
            onPress={() => setPage(page + 1)}
          >
            下一页目标
          </Button>
        </div>
      ) : null}
      <p className="text-sm">
        作用范围：{workspace.items.length}张图片 × {ids.length}个{noun}。
      </p>
      <p className="text-sm">
        {workspace.action.startsWith('add')
          ? '已有关系会显示“无需修改”。'
          : '不存在的关系会显示“无需修改”。'}
      </p>
      <p className="text-xs text-muted">
        每张图的多个目标一起保存。任一目标失效，该图整项失败；其他图片继续。
      </p>
      {creating ? (
        <UploadCreateTag
          isOpen
          onClose={() => setCreating(false)}
          onExpire={batch.onExpire}
          onComplete={(tag) => {
            choose([...new Set([...ids, tag.id])]);
            setCreating(false);
            setQ('');
            setPage(1);
            void client.invalidateQueries({
              queryKey: ['batch-targets', false],
            });
          }}
        />
      ) : null}
    </>
  );
}
