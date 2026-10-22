'use client';

import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { Table } from '@heroui/react/table';
import { Tooltip } from '@heroui/react/tooltip';
import { LockKeyhole, Settings2 } from 'lucide-react';
import { ComponentEntrance } from '../../components/component-entrance';
import { ImageShareDialog } from '../../components/sharing/image-share-dialog';
import { versionLabels } from '../../components/library/detail-labels';
import type { listImageShares } from '../../server/sharing/image-configuration';

export type ImageSharePage = ReturnType<typeof listImageShares>;
type Item = ImageSharePage['items'][number];
export function ImageSharesList({
  items,
  total,
  timeZone,
  disabled,
  onSessionExpire,
  onRefresh,
}: {
  items: Item[];
  total: number;
  timeZone: string;
  disabled: boolean;
  onSessionExpire: () => void;
  onRefresh: () => void;
}) {
  const [selected, setSelected] = useState<Item | null>(null);
  const deadline = new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const state = (item: Item) => (
    <p
      className={`text-xs ${item.state === 'expired' ? 'text-danger' : 'text-muted'}`}
    >
      {item.state === 'active'
        ? '有效'
        : item.state === 'expired'
          ? '已过期'
          : '已撤销'}
    </p>
  );
  const identity = (item: Item) => (
    <div className="flex min-w-0 items-center gap-3">
      <LockKeyhole size={20} aria-hidden className="shrink-0 text-muted" />
      <div className="grid min-w-0 gap-1">
        <p className="break-all text-sm">{item.displayName}</p>
        <p className="text-xs text-muted">
          私有图片 · {versionLabels[item.sourceVersion]}
        </p>
      </div>
    </div>
  );
  const action = (item: Item) => (
    <Tooltip>
      <Button
        variant="ghost"
        isIconOnly
        aria-label={`管理图片分享 ${item.displayName}`}
        className="size-11 shrink-0 rounded-lg"
        isDisabled={disabled}
        onPress={() => setSelected(item)}
      >
        <Settings2 size={18} aria-hidden />
      </Button>
      <Tooltip.Content>管理临时分享</Tooltip.Content>
    </Tooltip>
  );
  return (
    <>
      <ComponentEntrance
        delay={0.11}
        data-testid="image-shares-list"
        aria-busy={disabled}
        className="min-w-0 rounded-[20px] border border-border bg-surface px-4 py-5 xl:p-6"
      >
        <h2 className="text-lg font-medium">私有图片分享 · {total} 项</h2>
        <Table className="hidden rounded-none border-0 bg-transparent p-0 shadow-none md:block">
          <Table.Content
            aria-label="私有图片分享列表"
            className="w-full table-fixed border-collapse"
          >
            <Table.Header className="border-0 bg-transparent [&_th]:after:hidden">
              <Table.Column
                isRowHeader
                className="h-13 w-[40%] border-0 bg-transparent p-0 text-xs font-normal"
              >
                图片
              </Table.Column>
              <Table.Column className="h-13 w-[30%] border-0 bg-transparent p-0 text-xs font-normal">
                到期时间
              </Table.Column>
              <Table.Column className="h-13 w-[15%] border-0 bg-transparent p-0 text-xs font-normal">
                状态
              </Table.Column>
              <Table.Column className="h-13 w-[15%] border-0 bg-transparent p-0 text-xs font-normal">
                操作
              </Table.Column>
            </Table.Header>
            <Table.Body items={items} dependencies={[disabled, timeZone]}>
              {(item) => (
                <Table.Row
                  id={item.imageId}
                  className="h-22 border-b border-border bg-transparent"
                >
                  <Table.Cell className="border-0 p-0 pr-4">
                    {identity(item)}
                  </Table.Cell>
                  <Table.Cell className="border-0 p-0 pr-4 text-xs">
                    {deadline.format(new Date(item.expiresAt))}
                  </Table.Cell>
                  <Table.Cell className="border-0 p-0">
                    {state(item)}
                  </Table.Cell>
                  <Table.Cell className="border-0 p-0">
                    {action(item)}
                  </Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table.Content>
        </Table>
        <ul aria-label="私有图片分享列表" className="md:hidden">
          {items.map((item) => (
            <li
              key={item.imageId}
              className="flex min-w-0 items-center gap-2 border-b border-border py-4"
            >
              <div className="grid min-w-0 flex-1 gap-2">
                {identity(item)}
                <p className="text-xs text-muted">
                  {deadline.format(new Date(item.expiresAt))} 到期
                </p>
                {state(item)}
              </div>
              {action(item)}
            </li>
          ))}
        </ul>
      </ComponentEntrance>
      {selected ? (
        <ImageShareDialog
          key={selected.imageId}
          imageId={selected.imageId}
          displayName={selected.displayName}
          onClose={() => setSelected(null)}
          onSessionExpire={onSessionExpire}
          onChanged={onRefresh}
        />
      ) : null}
    </>
  );
}
