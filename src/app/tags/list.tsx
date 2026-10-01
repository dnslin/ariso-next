'use client';

import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { Table } from '@heroui/react/table';
import type { Tag } from './api';
import type { TagAction } from './dialog';

export function TagsList({
  items,
  total,
  timeZone,
  disabled,
  onAction,
}: {
  items: Tag[];
  total: number;
  timeZone: string;
  disabled: boolean;
  onAction: (action: TagAction) => void;
}) {
  const date = new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const mobileDate = new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    month: '2-digit',
    day: '2-digit',
  });
  function name(item: Tag) {
    return (
      <Link
        href={`/library?tagId=${encodeURIComponent(item.id)}`}
        isDisabled={disabled}
        className="min-h-11 min-w-11 justify-start text-sm font-normal text-foreground no-underline [overflow-wrap:anywhere]"
      >
        {item.displayName}
      </Link>
    );
  }
  function actions(item: Tag) {
    return (
      <div className="flex shrink-0 gap-1 md:gap-2">
        <Button
          variant="outline"
          aria-label={`编辑标签 ${item.displayName}`}
          isDisabled={disabled}
          className="h-11 w-17 min-w-0 rounded-xl px-2 text-sm font-normal xl:h-10 xl:w-22"
          onPress={() => onAction({ kind: 'edit', tag: item })}
        >
          编辑
        </Button>
        <Button
          variant="outline"
          aria-label={`删除标签 ${item.displayName}`}
          isDisabled={disabled}
          className="h-11 w-17 min-w-0 rounded-xl px-2 text-sm font-normal xl:h-10 xl:w-22"
          onPress={() => onAction({ kind: 'delete', tag: item })}
        >
          删除
        </Button>
      </div>
    );
  }
  return (
    <div
      data-testid="tags-list"
      className="rounded-[20px] border border-border bg-surface px-4 py-5 xl:p-6"
    >
      <h2 className="text-lg font-medium leading-normal">标签 · {total} 项</h2>
      <Table className="hidden rounded-none border-0 bg-transparent p-0 shadow-none md:block">
        <Table.Content
          aria-label="标签列表"
          className="w-full table-fixed border-collapse"
        >
          <Table.Header className="border-0 bg-transparent [&_th]:after:hidden">
            <Table.Column
              isRowHeader
              className="h-13 w-[36%] rounded-none border-0 bg-transparent p-0 text-xs font-normal text-foreground"
            >
              标签名称
            </Table.Column>
            <Table.Column className="h-13 w-[24%] border-0 bg-transparent p-0 text-xs font-normal text-foreground">
              图片数量
            </Table.Column>
            <Table.Column className="h-13 w-[16%] border-0 bg-transparent p-0 text-xs font-normal text-foreground">
              创建时间
            </Table.Column>
            <Table.Column className="h-13 w-[24%] border-0 bg-transparent p-0 text-xs font-normal text-foreground">
              操作
            </Table.Column>
          </Table.Header>
          <Table.Body items={items}>
            {(item) => (
              <Table.Row
                id={item.id}
                data-testid={`tag-${item.id}`}
                className="h-16 border-b border-border bg-transparent"
              >
                <Table.Cell className="border-0 p-0 pr-4">
                  {name(item)}
                </Table.Cell>
                <Table.Cell className="border-0 p-0 text-[13px]">
                  {item.imageCount} 张
                </Table.Cell>
                <Table.Cell className="border-0 p-0 text-[13px] text-muted">
                  {date.format(new Date(item.createdAt))}
                </Table.Cell>
                <Table.Cell className="border-0 p-0">
                  {actions(item)}
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table.Content>
      </Table>
      <ul aria-label="标签列表" className="md:hidden">
        {items.map((item) => (
          <li
            key={item.id}
            data-testid={`tag-${item.id}`}
            className="flex min-h-21 items-center justify-between gap-3 border-b border-border py-2"
          >
            <Link
              href={`/library?tagId=${encodeURIComponent(item.id)}`}
              isDisabled={disabled}
              className="flex min-h-11 min-w-11 flex-1 flex-col items-start justify-center gap-1 font-normal text-foreground no-underline [overflow-wrap:anywhere]"
            >
              <span className="text-sm font-normal">{item.displayName}</span>
              <span className="text-xs leading-normal">
                {item.imageCount} 张<br />
                创建于 {mobileDate.format(new Date(item.createdAt))}
              </span>
            </Link>
            {actions(item)}
          </li>
        ))}
      </ul>
    </div>
  );
}
