'use client';

import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { SearchField } from '@heroui/react/search-field';
import { Select } from '@heroui/react/select';
import { ListBox } from '@heroui/react/list-box';
import { Pagination } from '@heroui/react/pagination';
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group';
import { ToggleButton } from '@heroui/react/toggle-button';
import { ChevronDown } from 'lucide-react';
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
  onFilter,
  album = false,
}: {
  query: Query;
  onFilter: () => void;
  album?: boolean;
}) {
  return (
    <div
      data-testid="library-toolbar"
      className="grid gap-2 xl:flex xl:items-center xl:gap-3"
    >
      <div className="flex min-w-0 gap-2 xl:gap-3">
        <LibrarySearch key={query.filters?.q ?? ''} query={query} />
        <Button
          variant="outline"
          className="h-11 w-22 shrink-0 justify-between rounded-lg px-3 font-normal xl:h-9 xl:w-24"
          onPress={onFilter}
          isDisabled={!query.filters}
        >
          筛选
          <ChevronDown size={16} aria-hidden />
        </Button>
      </div>
      <div className="flex items-center gap-2 xl:gap-3">
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
            className="w-26.5 shrink-0 xl:w-36"
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
          <ToggleButton
            id="grid"
            variant="ghost"
            className="h-11 w-15.5 min-w-0 rounded-lg px-3 font-normal data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground xl:h-9 xl:w-16"
          >
            网格
          </ToggleButton>
          <ToggleButton
            id="masonry"
            variant="ghost"
            className="h-11 w-15.5 min-w-0 rounded-lg px-3 font-normal data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground xl:h-9 xl:w-20"
          >
            瀑布流
          </ToggleButton>
        </ToggleButtonGroup>
        <Button
          variant="outline"
          isDisabled
          aria-label="选择图片，尚未开放"
          className="h-11 min-w-0 flex-1 rounded-lg px-2 font-normal xl:h-9 xl:w-30 xl:flex-none"
        >
          选择图片
        </Button>
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
      <SearchField.Group className="h-11 min-w-0 rounded-lg border border-border bg-background px-3 shadow-none xl:h-9">
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
        className={`h-11 min-w-0 rounded-lg border border-border bg-background px-3 text-sm font-normal shadow-none ${compact ? 'xl:h-9' : ''}`}
      >
        <Select.Value className="whitespace-nowrap" />
        <Select.Indicator className={compact ? 'hidden' : undefined} />
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
