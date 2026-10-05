'use client';

import { useRef, useState } from 'react';
import {
  keepPreviousData,
  useInfiniteQuery,
  type QueryClient,
} from '@tanstack/react-query';
import { Autocomplete } from '@heroui/react/autocomplete';
import { Button } from '@heroui/react/button';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { SearchField } from '@heroui/react/search-field';
import { ChevronDown, Search } from 'lucide-react';
import type {
  LibraryFilterOption,
  LibraryFilterOptionKind,
  LibraryFilterOptions,
} from '../../server/library/filter-options-types';

export async function readFilterOptions(
  params: URLSearchParams,
  signal: AbortSignal,
  client: QueryClient,
  onSessionExpired: () => void,
): Promise<LibraryFilterOptions> {
  const response = await fetch(`/api/images/filter-options?${params}`, {
    signal,
    cache: 'no-store',
  });
  if (response.status === 401) {
    client.clear();
    onSessionExpired();
  }
  if (!response.ok) {
    const body = await response.json();
    throw new Error(`${body.message}（HTTP ${response.status}）`);
  }
  return response.json();
}

export function LibraryFilterOptionsField({
  kind,
  label,
  selectedIds,
  onChange,
  client,
  onSessionExpired,
  disabled = false,
  presentation = 'condition',
}: {
  kind: LibraryFilterOptionKind;
  label: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  client: QueryClient;
  onSessionExpired: () => void;
  disabled?: boolean;
  presentation?: 'condition' | 'field';
}) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const query = useInfiniteQuery(
    {
      queryKey: ['library-filter-options', kind, search, selectedIds],
      initialPageParam: 1,
      queryFn: async ({ pageParam, signal }): Promise<LibraryFilterOptions> => {
        const params = new URLSearchParams({
          kind,
          q: search,
          page: String(pageParam),
        });
        for (const id of selectedIds) params.append('selectedId', id);
        return readFilterOptions(params, signal, client, onSessionExpired);
      },
      getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
      retry: false,
      networkMode: 'always',
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousData,
    },
    client,
  );
  const knownPages = query.data?.pages ?? [];
  const pages = query.isPlaceholderData ? [] : knownPages;
  const pending = query.isPending || query.isPlaceholderData;
  const selected = pages[0]?.selected ?? [];
  const missing = new Set(pages[0]?.missingIds ?? []);
  const items = [
    ...new Map(
      [
        ...selectedIds.map((id) => ({
          id,
          name: missing.has(id)
            ? `已失效：${id}`
            : query.isError
              ? `读取失败：${id}`
              : `正在读取：${id}`,
        })),
        ...selected,
        ...pages.flatMap((page) => page.items),
      ].map((item) => [item.id, item]),
    ).values(),
  ];
  const optionName = (item: LibraryFilterOption) =>
    `${item.name}${item.enabled === false ? '（已停用）' : ''}`;
  const names = selectedIds.map((id) =>
    optionName(
      (query.isPlaceholderData
        ? knownPages
            .flatMap((page) => [...page.selected, ...page.items])
            .find((item) => item.id === id)
        : undefined) ?? items.find((item) => item.id === id)!,
    ),
  );
  return (
    <Autocomplete<LibraryFilterOption, 'single' | 'multiple'>
      className={
        presentation === 'field' ? 'min-w-0 flex-1' : 'min-w-0 max-w-72 flex-1'
      }
      selectionMode={kind === 'tags' ? 'multiple' : 'single'}
      value={kind === 'tags' ? selectedIds : (selectedIds[0] ?? null)}
      onChange={(value) =>
        onChange(
          Array.isArray(value)
            ? value.map(String)
            : value === null
              ? []
              : [String(value)],
        )
      }
      isDisabled={disabled}
      allowsEmptyCollection
      placeholder="全部"
    >
      <Label className={presentation === 'field' ? 'text-sm' : 'sr-only'}>
        {label}
      </Label>
      <Autocomplete.Trigger
        className={
          presentation === 'field'
            ? 'h-12 min-h-12 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-0 pe-11 shadow-none [&>button]:absolute [&>button]:inset-y-0 [&>button]:right-0 [&>button]:h-12 [&>button]:w-11'
            : 'h-11 min-h-11 w-full items-center gap-2 rounded-lg border-0 bg-transparent px-3 py-0 pe-11 shadow-none [&>button]:absolute [&>button]:inset-y-0 [&>button]:right-0 [&>button]:h-11 [&>button]:w-11'
        }
      >
        {presentation === 'condition' ? (
          <span className="shrink-0 text-sm text-muted">
            {kind === 'tags' ? '标签' : label}
          </span>
        ) : null}
        <Autocomplete.Value className="min-w-0 truncate text-sm text-foreground">
          {names.length
            ? names.join('、')
            : presentation === 'field'
              ? `全部${label}`
              : '全部'}
        </Autocomplete.Value>
        <Autocomplete.Indicator className="end-3.5 size-4">
          <ChevronDown aria-hidden="true" />
        </Autocomplete.Indicator>
      </Autocomplete.Trigger>
      <Autocomplete.Popover className="max-h-80 min-w-64 max-w-[calc(100vw-32px)] overflow-y-auto rounded-xl border border-border bg-surface p-2">
        <Autocomplete.Filter inputValue={search} onInputChange={setSearch}>
          <SearchField aria-label={`搜索${label}`}>
            <SearchField.Group className="min-h-11 rounded-lg border border-border shadow-none">
              <SearchField.SearchIcon>
                <Search className="size-4" />
              </SearchField.SearchIcon>
              <SearchField.Input ref={inputRef} placeholder="输入名称搜索" />
            </SearchField.Group>
          </SearchField>
          <ListBox
            items={pending ? [] : items}
            className="max-h-48 overflow-y-auto"
            renderEmptyState={() =>
              pending
                ? '正在读取选项…'
                : query.isError
                  ? '选项读取失败'
                  : '暂无匹配项'
            }
          >
            {(item) => (
              <ListBox.Item
                id={item.id}
                textValue={optionName(item)}
                className="min-h-11"
              >
                <span className="min-w-0 break-all">
                  {optionName(item)}
                  {kind === 'albums' ? (
                    <span className="block text-xs text-muted">{item.id}</span>
                  ) : null}
                </span>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            )}
          </ListBox>
        </Autocomplete.Filter>
        {query.isError ? (
          <p role="alert" className="p-2 text-sm text-danger">
            {query.error.message}
          </p>
        ) : null}
        {!pending && query.hasNextPage ? (
          <Button
            variant="ghost"
            className="min-h-11 w-full"
            isDisabled={query.isFetchingNextPage}
            onPress={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? '正在读取…' : '加载更多选项'}
          </Button>
        ) : null}
        {query.isError ||
        (!pending && !pages.some((page) => page.items.length)) ? (
          <Button
            variant="ghost"
            className="min-h-11 w-full"
            onPress={() => {
              inputRef.current?.focus();
              void query.refetch();
            }}
          >
            重新读取选项
          </Button>
        ) : null}
        {selectedIds.length ? (
          <Button
            variant="ghost"
            className="min-h-11 w-full"
            onPress={() => onChange([])}
          >
            清除{kind === 'tags' ? '标签' : label}筛选
          </Button>
        ) : null}
      </Autocomplete.Popover>
    </Autocomplete>
  );
}
