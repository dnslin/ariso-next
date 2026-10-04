'use client';

import type { QueryClient } from '@tanstack/react-query';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Select } from '@heroui/react/select';
import { ChevronDown } from 'lucide-react';
import { LibraryFilterOptionsField } from '../library/library-filter-options';
import type { LibraryFilters } from '../../server/library/query-schema';
import type { TrashQueryPatch } from './query-state';

export function TrashFilters({
  filters,
  client,
  disabled,
  onApply,
  onSessionExpired,
}: {
  filters: LibraryFilters;
  client: QueryClient;
  disabled: boolean;
  onApply: (patch: Partial<TrashQueryPatch>) => void;
  onSessionExpired: () => void;
}) {
  return (
    <div
      data-testid="trash-filters"
      aria-label="回收筛选条件"
      className="grid min-w-0 gap-3 md:grid-cols-3"
    >
      <LibraryFilterOptionsField
        kind="storages"
        label="存储"
        presentation="field"
        selectedIds={filters.storageId ? [filters.storageId] : []}
        onChange={(ids) => onApply({ storageId: ids[0] ?? null })}
        client={client}
        onSessionExpired={onSessionExpired}
        disabled={disabled}
      />
      <TrashChoice
        label="处理状态"
        value={filters.status}
        disabled={disabled}
        onChange={(status) => onApply({ status })}
        options={[
          { id: 'pending', name: '等待处理' },
          { id: 'processing', name: '处理中' },
          { id: 'ready', name: '已就绪' },
          { id: 'failed', name: '处理失败' },
        ]}
      />
      <TrashChoice
        label="删除状态"
        value={filters.deletionStatus}
        disabled={disabled}
        onChange={(deletionStatus) => onApply({ deletionStatus })}
        options={[
          { id: 'none', name: '已回收' },
          { id: 'deleting', name: '删除中' },
          { id: 'cleanup_failed', name: '清理失败' },
        ]}
      />
    </div>
  );
}

function TrashChoice<T extends string>({
  label,
  value,
  disabled,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  disabled: boolean;
  options: { id: T; name: string }[];
  onChange: (value: T | null) => void;
}) {
  return (
    <Select
      className="min-w-0"
      value={value ?? ''}
      isDisabled={disabled}
      onChange={(value) => onChange(value ? (String(value) as T) : null)}
    >
      <Label className="text-sm">{label}</Label>
      <Select.Trigger className="h-12 min-h-12 w-full items-center rounded-lg border border-border bg-background px-3 py-0 pe-11 text-sm shadow-none">
        <Select.Value />
        <Select.Indicator className="end-3.5 size-4">
          <ChevronDown aria-hidden />
        </Select.Indicator>
      </Select.Trigger>
      <Select.Popover className="rounded-xl border border-border bg-surface">
        <ListBox>
          {[{ id: '', name: `全部${label}` }, ...options].map((item) => (
            <ListBox.Item
              key={item.id}
              id={item.id}
              textValue={item.name}
              className="min-h-11"
            >
              {item.name}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

export function TrashPageSize({
  value,
  disabled,
  onChange,
}: {
  value: 20 | 40 | 80;
  disabled: boolean;
  onChange: (value: 20 | 40 | 80) => void;
}) {
  return (
    <Select
      value={String(value)}
      isDisabled={disabled}
      onChange={(key) => onChange(Number(key) as 20 | 40 | 80)}
      className="w-20 shrink-0"
    >
      <Label className="sr-only">每页条数</Label>
      <Select.Trigger className="h-11 min-h-11 items-center rounded-lg border border-border bg-background px-3 py-0 pe-8 text-sm shadow-none">
        <Select.Value />
        <Select.Indicator className="end-2 size-4">
          <ChevronDown aria-hidden />
        </Select.Indicator>
      </Select.Trigger>
      <Select.Popover className="rounded-xl border border-border bg-surface">
        <ListBox>
          {[20, 40, 80].map((size) => (
            <ListBox.Item
              key={size}
              id={String(size)}
              textValue={String(size)}
              className="min-h-11"
            >
              {size}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
