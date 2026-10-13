'use client';

import { ComponentEntrance } from '../../components/component-entrance';

import { Link } from '@heroui/react/link';
import { Table } from '@heroui/react/table';
import { Tooltip } from '@heroui/react/tooltip';
import { Settings2 } from 'lucide-react';
import type { listShares } from '../../server/sharing/configuration';
import { AlbumCoverImage } from '../albums/cover-preview';
import { shareSettingsHref } from '../albums/collection-navigation';

export type SharePage = ReturnType<typeof listShares>;
type ShareItem = SharePage['items'][number];

export function SharesList({
  items,
  total,
  timeZone,
  disabled = false,
  returnTo = '/shares',
  onNavigate,
}: {
  items: ShareItem[];
  total: number;
  timeZone: string;
  disabled?: boolean;
  returnTo?: string;
  onNavigate?: (opener: HTMLElement) => void;
}) {
  const deadline = new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  function identity(item: ShareItem) {
    return (
      <div className="flex min-w-0 items-center gap-3">
        <div
          data-cover-status={item.cover.status}
          className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-default text-center [&_p]:p-1 [&_p]:text-[10px] [&_p]:leading-tight"
        >
          <AlbumCoverImage
            key={`${item.cover.imageId}-${item.cover.status}-${item.cover.thumbnailUrl}`}
            cover={item.cover}
          />
        </div>
        <div className="grid min-w-0 gap-1">
          <p className="text-sm [overflow-wrap:anywhere]">{item.albumName}</p>
          <p className="text-xs text-muted">
            {item.publicImageCount} 张公开图片 · #{item.albumId.slice(0, 8)}
          </p>
        </div>
      </div>
    );
  }
  function access(item: ShareItem) {
    return (
      <p className="text-xs leading-normal [overflow-wrap:anywhere] md:text-[13px]">
        {item.hasPassword ? '密码保护' : '无密码'} ·{' '}
        {item.expiresAt
          ? `${deadline.format(new Date(item.expiresAt))} 到期`
          : '永久有效'}
      </p>
    );
  }
  function state(item: ShareItem) {
    return (
      <p
        className={`text-xs md:text-[13px] ${item.state === 'expired' ? 'text-danger' : 'text-muted'}`}
      >
        {item.state === 'enabled'
          ? '已启用'
          : item.state === 'expired'
            ? '已过期'
            : '已关闭'}
      </p>
    );
  }
  function action(item: ShareItem, surface: 'desktop' | 'mobile') {
    return (
      <Tooltip>
        <Link
          href={shareSettingsHref(item.albumId, returnTo)}
          id={`share-settings-${item.albumId}-${surface}`}
          data-collection-return-focus={`share-settings-${item.albumId}`}
          onClick={(event) => onNavigate?.(event.currentTarget as HTMLElement)}
          isDisabled={disabled}
          aria-label={`分享设置 ${item.albumName} #${item.albumId.slice(0, 8)}`}
          className="size-11 shrink-0 justify-center rounded-lg text-foreground no-underline hover:bg-default"
        >
          <Settings2 size={18} aria-hidden />
        </Link>
        <Tooltip.Content>设置</Tooltip.Content>
      </Tooltip>
    );
  }
  return (
    <ComponentEntrance
      delay={0.11}
      data-testid="shares-list"
      aria-busy={disabled}
      className="min-w-0 rounded-[20px] border border-border bg-surface px-4 py-5 xl:p-6"
    >
      <h2 className="text-lg font-medium leading-normal">分享 · {total} 项</h2>
      <Table className="hidden rounded-none border-0 bg-transparent p-0 shadow-none md:block">
        <Table.Content
          aria-label="分享相册列表"
          className="w-full table-fixed border-collapse"
        >
          <Table.Header className="border-0 bg-transparent [&_th]:after:hidden">
            <Table.Column
              isRowHeader
              className="h-13 w-[36%] rounded-none border-0 bg-transparent p-0 text-xs font-normal text-foreground"
            >
              分享相册
            </Table.Column>
            <Table.Column className="h-13 w-[26%] border-0 bg-transparent p-0 text-xs font-normal text-foreground">
              访问设置
            </Table.Column>
            <Table.Column className="h-13 w-[16%] border-0 bg-transparent p-0 text-xs font-normal text-foreground">
              状态
            </Table.Column>
            <Table.Column className="h-13 w-[22%] border-0 bg-transparent p-0 text-xs font-normal text-foreground">
              操作
            </Table.Column>
          </Table.Header>
          <Table.Body
            items={items}
            dependencies={[disabled, returnTo, onNavigate]}
          >
            {(item) => (
              <Table.Row
                id={item.id}
                data-share-album-id={item.albumId}
                className="h-22 border-b border-border bg-transparent"
              >
                <Table.Cell className="border-0 p-0 pr-4">
                  {identity(item)}
                </Table.Cell>
                <Table.Cell className="border-0 p-0 pr-4">
                  {access(item)}
                </Table.Cell>
                <Table.Cell className="border-0 p-0">{state(item)}</Table.Cell>
                <Table.Cell className="border-0 p-0">
                  {action(item, 'desktop')}
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table.Content>
      </Table>
      <ul aria-label="分享相册列表" className="md:hidden">
        {items.map((item) => (
          <li
            key={item.id}
            data-share-album-id={item.albumId}
            className="flex items-center gap-2 border-b border-border py-4"
          >
            <div className="grid min-w-0 flex-1 gap-2">
              {identity(item)}
              {access(item)}
            </div>
            <div className="grid w-20 shrink-0 justify-items-center gap-2">
              {state(item)}
              {action(item, 'mobile')}
            </div>
          </li>
        ))}
      </ul>
    </ComponentEntrance>
  );
}
