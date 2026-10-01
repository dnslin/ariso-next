'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@heroui/react/button';
import { SearchField } from '@heroui/react/search-field';
import { Select } from '@heroui/react/select';
import { ListBox } from '@heroui/react/list-box';
import { Pagination } from '@heroui/react/pagination';
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group';
import { ToggleButton } from '@heroui/react/toggle-button';
import { Tooltip } from '@heroui/react/tooltip';
import { LayoutDashboard, LayoutGrid, RefreshCw } from 'lucide-react';
import type { useLibraryQuery } from './use-library-query';

type Query = ReturnType<typeof useLibraryQuery>;
const sortOptions = [
  { id: 'uploaded_desc', label: '上传时间 ↓' },
  { id: 'uploaded_asc', label: '上传时间 ↑' },
  { id: 'size_desc', label: '文件大小 ↓' },
  { id: 'size_asc', label: '文件大小 ↑' },
] as const;

export function LibraryToolbar({
  query,
  selectionMenu,
  album = false,
}: {
  query: Query;
  selectionMenu?: ReactNode;
  album?: boolean;
}) {
  return (
    <div
      data-testid="library-toolbar"
      className="grid gap-2 xl:flex xl:items-center xl:gap-3"
    >
      <div className="flex min-w-0 gap-2 xl:gap-3">
        <LibrarySearch key={query.filters?.q ?? ''} query={query} />
      </div>
      <div className="flex min-w-0 items-center gap-1 xl:gap-3">
        {!album ? (
          <LibrarySelect
            label="图片排序"
            value={query.filters?.sort ?? 'uploaded_desc'}
            options={sortOptions}
            onChange={(sort) => {
              void query.applyQuery({
                sort: sortOptions.find((option) => option.id === sort)!.id,
              });
            }}
            className="w-auto min-w-0 shrink"
            compact
          />
        ) : (
          <p className="text-xs text-muted">加入时间 ↓</p>
        )}
        <ToggleButtonGroup
          aria-label="图片布局"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[query.layout]}
          onSelectionChange={(keys) => {
            const value = [...keys][0];
            if (value === 'grid' || value === 'masonry') query.setLayout(value);
          }}
          isDetached
          className="gap-2 bg-transparent p-0 xl:gap-1"
        >
          <Tooltip>
            <ToggleButton
              id="grid"
              aria-label="网格"
              isIconOnly
              variant="ghost"
              className="size-11 min-w-0 rounded-lg data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground xl:size-9"
            >
              <LayoutGrid size={18} aria-hidden />
            </ToggleButton>
            <Tooltip.Content>网格</Tooltip.Content>
          </Tooltip>
          <Tooltip>
            <ToggleButton
              id="masonry"
              aria-label="瀑布流"
              isIconOnly
              variant="ghost"
              className="size-11 min-w-0 rounded-lg data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground xl:size-9"
            >
              <LayoutDashboard size={18} aria-hidden />
            </ToggleButton>
            <Tooltip.Content>瀑布流</Tooltip.Content>
          </Tooltip>
        </ToggleButtonGroup>
        {selectionMenu ?? (
          <Tooltip closeDelay={0}>
            <Button
              aria-label="刷新图库"
              isIconOnly
              variant="ghost"
              className="relative size-11 min-w-0 rounded-lg xl:size-9"
              data-refresh-available={query.refreshAvailable || undefined}
              isDisabled={query.isFetching}
              onPress={() => void query.refresh()}
            >
              <RefreshCw size={18} aria-hidden />
              {query.refreshAvailable ? (
                <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-accent" />
              ) : null}
            </Button>
            <Tooltip.Content>
              {query.refreshAvailable ? '图片有更新，点击刷新' : '刷新图库'}
            </Tooltip.Content>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
function LibrarySearch({ query }: { query: Query }) {
  const [value, setValue] = useState(query.filters?.q ?? '');
  return (
    <SearchField
      aria-label="搜索图片名称"
      value={value}
      onChange={setValue}
      onSubmit={(q) => {
        void query.applyQuery({ q });
      }}
      onClear={() => {
        void query.applyQuery({ q: null });
      }}
      className="min-w-0 flex-1 xl:w-70"
    >
      <SearchField.Group className="h-11 min-w-0 rounded-lg border border-border bg-background shadow-none xl:h-9">
        <SearchField.Input
          placeholder="搜索图片名称…"
          className="min-w-0 text-base xl:text-sm"
        />
        {value ? (
          <SearchField.ClearButton
            aria-label="清除搜索"
            className="size-11 shrink-0 xl:size-8"
          />
        ) : null}
      </SearchField.Group>
    </SearchField>
  );
}
export function LibrarySelect({
  label,
  value,
  options,
  onChange,
  className,
  compact = false,
}: {
  label: string;
  value: string;
  options: readonly { id: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Select
      aria-label={label}
      value={value}
      onChange={(key) => {
        if (key !== null) onChange(String(key));
      }}
      className={className}
    >
      <Select.Trigger
        className={`h-11 min-w-0 rounded-lg border border-border bg-background text-sm font-normal shadow-none ${compact ? 'px-2 xl:h-9 xl:px-3' : 'px-3'}`}
      >
        <Select.Value className="truncate" />
        {!compact ? <Select.Indicator /> : null}
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item
              key={option.id}
              id={option.id}
              textValue={option.label}
              className="min-h-11"
            >
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
export function LibraryFooter({ query }: { query: Query }) {
  const pageSize = query.filters?.pageSize ?? 40;
  const pages = Math.max(1, Math.ceil((query.total ?? 0) / pageSize));
  return (
    <div className="grid w-full gap-2 md:flex md:flex-wrap md:items-center md:justify-between">
      <p data-testid="library-count" role="status" className="text-[13px]">
        {query.expired
          ? '登录已失效'
          : query.total === undefined
            ? '数量待确认'
            : `${query.total.toLocaleString('zh-CN')} 张图片 · ${query.loadingMode === 'more' ? '已加载' : '本页'} ${query.items.length} 张`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <LibrarySelect
          label="图片加载方式"
          value={query.loadingMode}
          options={[
            { id: 'more', label: '加载更多' },
            { id: 'pages', label: '分页' },
          ]}
          onChange={(value) => {
            void query.setLoadingMode(value as 'more' | 'pages');
          }}
          className="w-28"
        />
        <LibrarySelect
          label="每批图片数"
          value={String(pageSize)}
          options={[20, 40, 80].map((size) => ({
            id: String(size),
            label: `${size} 张 / 批`,
          }))}
          onChange={(value) => {
            void query.applyQuery({ pageSize: Number(value) as 20 | 40 | 80 });
          }}
          className="w-30"
        />
        {query.loadingMode === 'pages' ? (
          <Pagination aria-label="图库分页" className="w-full md:w-auto">
            <Pagination.Content className="w-full gap-2">
              <Pagination.Item className="flex-1">
                <Pagination.Previous
                  className="h-11 w-full rounded-lg border border-border px-3 font-normal"
                  isDisabled={query.page <= 1 || query.isFetching}
                  onPress={() => {
                    void query.setPage(query.page - 1);
                  }}
                >
                  上一页
                </Pagination.Previous>
              </Pagination.Item>
              <Pagination.Item>
                <Pagination.Summary className="text-xs">
                  {query.page}/{pages}
                </Pagination.Summary>
              </Pagination.Item>
              <Pagination.Item className="flex-1">
                <Pagination.Next
                  className="h-11 w-full rounded-lg border border-border px-3 font-normal"
                  isDisabled={
                    query.total === undefined ||
                    query.page >= pages ||
                    query.isFetching
                  }
                  onPress={() => {
                    void query.setPage(query.page + 1);
                  }}
                >
                  下一页
                </Pagination.Next>
              </Pagination.Item>
            </Pagination.Content>
          </Pagination>
        ) : null}
      </div>
    </div>
  );
}
