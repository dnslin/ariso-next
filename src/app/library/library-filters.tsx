'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { QueryClient } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { DateField } from '@heroui/react/date-field';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Dropdown } from '@heroui/react/dropdown';
import { Popover } from '@heroui/react/popover';
import { I18nProvider } from '@heroui/react/rac';
import { Select } from '@heroui/react/select';
import {
  parseAbsolute,
  toCalendarDate,
  type CalendarDate,
} from '@internationalized/date';
import { ChevronDown, Plus, X } from 'lucide-react';
import { libraryDateRange } from '../../server/library/query-dates';
import type { LibraryFilters } from '../../server/library/query-schema';
import type { LibraryQueryPatch } from './query-state';
import { LibraryFilterOptionsField } from './library-filter-options';

type Props = {
  filters: LibraryFilters;
  timeZone: string;
  fixedAlbumId?: string;
  onApply: (patch: LibraryQueryPatch) => void;
  onSessionExpired: () => void;
};

/** Undefined preserves an applied instant; null explicitly clears that boundary. */
export function filterDateBounds(
  filters: Pick<LibraryFilters, 'uploadedFrom' | 'uploadedBefore'>,
  from: string | null | undefined,
  through: string | null | undefined,
  timeZone: string,
) {
  const dates = libraryDateRange(
    from ?? undefined,
    through ?? undefined,
    timeZone,
  );
  const uploadedFrom =
    from === undefined ? filters.uploadedFrom : (dates.uploadedFrom ?? null);
  const uploadedBefore =
    through === undefined
      ? filters.uploadedBefore
      : (dates.uploadedBefore ?? null);
  if (
    uploadedFrom &&
    uploadedBefore &&
    Date.parse(uploadedFrom) >= Date.parse(uploadedBefore)
  )
    throw new Error('上传开始日期必须早于结束边界');
  return { uploadedFrom, uploadedBefore };
}

function FilterDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: CalendarDate | null;
  onChange: (value: CalendarDate | null) => void;
}) {
  return (
    <DateField
      aria-label={label}
      value={value}
      onChange={onChange}
      className="min-w-0 flex-1"
      validationBehavior="native"
    >
      {({ state }) => {
        const editable = state.segments.filter((segment) => segment.isEditable);
        const incomplete =
          editable.some((segment) => segment.isPlaceholder) &&
          editable.some((segment) => !segment.isPlaceholder);
        return (
          <DateField.Group
            data-library-incomplete-date={incomplete || undefined}
            className="h-11 min-h-11 border-0 bg-transparent shadow-none"
          >
            <DateField.Input className="min-w-0 px-1 text-sm">
              {(segment) => (
                <DateField.Segment
                  segment={segment}
                  data-library-empty-date-segment={
                    (segment.isEditable && segment.isPlaceholder) || undefined
                  }
                  className="px-0 text-sm"
                />
              )}
            </DateField.Input>
          </DateField.Group>
        );
      }}
    </DateField>
  );
}

function Choice<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T | null;
  onChange: (value: T | null) => void;
  options: readonly { id: T; name: string }[];
}) {
  return (
    <Select
      className="min-w-0 flex-1"
      value={value ?? ''}
      onChange={(value) => onChange(value ? (String(value) as T) : null)}
    >
      <Label className="sr-only">{label}</Label>
      <Select.Trigger className="h-11 min-h-11 w-full gap-2 rounded-lg border-0 bg-transparent px-3 text-sm shadow-none">
        <span className="shrink-0 text-muted">{label}</span>
        <Select.Value className="truncate" />
        <Select.Indicator>
          <ChevronDown className="size-4" aria-hidden="true" />
        </Select.Indicator>
      </Select.Trigger>
      <Select.Popover className="rounded-xl border border-border bg-surface">
        <ListBox>
          {[{ id: '', name: '全部' }, ...options].map((item) => (
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

function DateEditor({
  filters,
  timeZone,
  onApply,
  onClose,
}: Pick<Props, 'filters' | 'timeZone' | 'onApply'> & { onClose: () => void }) {
  const [from, setFrom] = useState<CalendarDate | null>(() =>
    filters.uploadedFrom
      ? toCalendarDate(parseAbsolute(filters.uploadedFrom, timeZone))
      : null,
  );
  const [through, setThrough] = useState<CalendarDate | null>(() =>
    filters.uploadedBefore
      ? toCalendarDate(
          parseAbsolute(
            new Date(Date.parse(filters.uploadedBefore) - 1).toISOString(),
            timeZone,
          ),
        )
      : null,
  );
  const [fromEdited, setFromEdited] = useState(false);
  const [throughEdited, setThroughEdited] = useState(false);
  const [error, setError] = useState('');
  function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const incomplete = event.currentTarget.querySelector(
      '[data-library-incomplete-date="true"]',
    );
    if (incomplete) {
      setError('日期未填写完整，请补全年、月、日，或清空该日期。');
      incomplete
        .querySelector<HTMLElement>('[data-library-empty-date-segment="true"]')
        ?.focus();
      return;
    }
    try {
      onApply(
        filterDateBounds(
          filters,
          fromEdited ? (from?.toString() ?? null) : undefined,
          throughEdited ? (through?.toString() ?? null) : undefined,
          timeZone,
        ),
      );
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  return (
    <form onSubmit={apply} className="flex flex-col gap-3">
      <Popover.Heading className="text-sm font-medium">
        上传日期
      </Popover.Heading>
      <p className="text-xs text-muted">
        修改日期时按 {timeZone} 的整日计算，结束日期包含当天。
      </p>
      <I18nProvider locale="zh-CN">
        <div className="flex min-h-11 items-center rounded-lg border border-border bg-surface px-2">
          <FilterDateField
            label="上传开始日期"
            value={from}
            onChange={(value) => {
              setFrom(value);
              setFromEdited(true);
              setError('');
            }}
          />
          <span className="px-1 text-sm">至</span>
          <FilterDateField
            label="上传结束日期（包含当天）"
            value={through}
            onChange={(value) => {
              setThrough(value);
              setThroughEdited(true);
              setError('');
            }}
          />
        </div>
      </I18nProvider>
      {filters.uploadedFrom || filters.uploadedBefore ? (
        <p className="text-xs text-muted" data-testid="filter-date-boundaries">
          当前生效区间（{timeZone}）：
          {filters.uploadedFrom
            ? new Intl.DateTimeFormat('zh-CN', {
                timeZone,
                dateStyle: 'short',
                timeStyle: 'long',
              }).format(new Date(filters.uploadedFrom))
            : '不限'}
          （含）至{' '}
          {filters.uploadedBefore
            ? new Intl.DateTimeFormat('zh-CN', {
                timeZone,
                dateStyle: 'short',
                timeStyle: 'long',
              }).format(new Date(filters.uploadedBefore))
            : '不限'}
          （不含）。未修改的边界保持不变。
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" className="min-h-11" onPress={onClose}>
          取消日期
        </Button>
        <Button type="submit" className="min-h-11">
          应用日期
        </Button>
      </div>
    </form>
  );
}

const categories = [
  { id: 'tags', name: '标签' },
  { id: 'date', name: '上传日期' },
  { id: 'visibility', name: '可见性' },
  { id: 'status', name: '处理状态' },
  { id: 'storages', name: '存储位置' },
  { id: 'albums', name: '相册' },
  { id: 'format', name: '格式' },
] as const;
type Category = (typeof categories)[number]['id'];

export function LibraryFiltersBar({
  filters,
  timeZone,
  fixedAlbumId,
  onApply,
  onSessionExpired,
}: Props) {
  const [client] = useState(() => new QueryClient());
  useEffect(() => () => client.clear(), [client]);
  const [added, setAdded] = useState<Category[]>([]);
  const [dateOpen, setDateOpen] = useState(false);
  const [dateBoundary, setDateBoundary] = useState<HTMLElement | null>(null);
  const attachDateTrigger = useCallback((element: HTMLButtonElement | null) => {
    setDateBoundary(element?.closest('main') ?? null);
  }, []);
  const addRef = useRef<HTMLButtonElement>(null);
  const active: Record<Category, boolean> = {
    tags: filters.tagIds.length > 0,
    date: !!(filters.uploadedFrom || filters.uploadedBefore),
    visibility: !!filters.visibility,
    status: !!filters.status,
    storages: !!filters.storageId,
    albums: !!(fixedAlbumId || filters.albumId),
    format: !!filters.format,
  };
  const visible = categories.filter(
    ({ id }) => active[id] || added.includes(id),
  );
  const available = categories.filter(
    ({ id }) => !active[id] && !added.includes(id),
  );
  const clears: Record<Category, LibraryQueryPatch> = {
    tags: { tagId: [] },
    date: { uploadedFrom: null, uploadedBefore: null },
    visibility: { visibility: null },
    status: { status: null },
    storages: { storageId: null },
    albums: { albumId: null },
    format: { format: null },
  };
  function remove(id: Category) {
    addRef.current?.focus();
    if (id === 'date') setDateOpen(false);
    setAdded((current) => current.filter((item) => item !== id));
    if (active[id]) onApply(clears[id]);
  }
  const dateLabel = [
    filters.uploadedFrom
      ? toCalendarDate(parseAbsolute(filters.uploadedFrom, timeZone)).toString()
      : '不限',
    filters.uploadedBefore
      ? toCalendarDate(
          parseAbsolute(
            new Date(Date.parse(filters.uploadedBefore) - 1).toISOString(),
            timeZone,
          ),
        ).toString()
      : '不限',
  ].join(' 至 ');
  const fields: Record<Category, ReactNode> = {
    tags: (
      <LibraryFilterOptionsField
        kind="tags"
        label="标签（匹配任意一个）"
        selectedIds={filters.tagIds}
        onChange={(tagId) => onApply({ tagId })}
        client={client}
        onSessionExpired={onSessionExpired}
      />
    ),
    storages: (
      <LibraryFilterOptionsField
        kind="storages"
        label="存储位置"
        selectedIds={filters.storageId ? [filters.storageId] : []}
        onChange={(ids) => onApply({ storageId: ids[0] ?? null })}
        client={client}
        onSessionExpired={onSessionExpired}
      />
    ),
    albums: (
      <LibraryFilterOptionsField
        kind="albums"
        label="相册"
        selectedIds={
          fixedAlbumId
            ? [fixedAlbumId]
            : filters.albumId
              ? [filters.albumId]
              : []
        }
        onChange={(ids) => onApply({ albumId: ids[0] ?? null })}
        client={client}
        onSessionExpired={onSessionExpired}
        disabled={!!fixedAlbumId}
      />
    ),
    visibility: (
      <Choice
        label="可见性"
        value={filters.visibility}
        onChange={(visibility) => onApply({ visibility })}
        options={[
          { id: 'public', name: '公开' },
          { id: 'private', name: '私有' },
        ]}
      />
    ),
    status: (
      <Choice
        label="处理状态"
        value={filters.status}
        onChange={(status) => onApply({ status })}
        options={[
          { id: 'pending', name: '等待处理' },
          { id: 'processing', name: '处理中' },
          { id: 'ready', name: '已就绪' },
          { id: 'failed', name: '处理失败' },
        ]}
      />
    ),
    format: (
      <Choice
        label="格式"
        value={filters.format}
        onChange={(format) => onApply({ format })}
        options={[
          { id: 'jpeg', name: 'JPEG' },
          { id: 'png', name: 'PNG / APNG' },
          { id: 'gif', name: 'GIF' },
          { id: 'webp', name: 'WebP' },
          { id: 'avif', name: 'AVIF' },
          { id: 'heif', name: 'HEIC / HEIF' },
          { id: 'tiff', name: 'TIFF' },
          { id: 'bmp', name: 'BMP' },
          { id: 'ico', name: 'ICO' },
          { id: 'svg', name: 'SVG' },
        ]}
      />
    ),
    date: (
      <Popover isOpen={dateOpen} onOpenChange={setDateOpen}>
        <Button
          ref={attachDateTrigger}
          variant="ghost"
          className="min-h-11 min-w-0 gap-2 px-3 text-sm"
          aria-label="编辑上传日期"
        >
          <span className="shrink-0 text-muted">上传日期</span>
          <span className="truncate">
            {active.date ? dateLabel : '选择日期'}
          </span>
          <ChevronDown className="size-4 shrink-0" />
        </Button>
        <Popover.Content
          data-testid="filter-date-popover"
          boundaryElement={dateBoundary ?? undefined}
          placement="bottom start"
          className="flex w-[min(360px,calc(100vw-32px))] max-w-none flex-col overflow-hidden rounded-xl border border-border bg-surface"
        >
          <Popover.Dialog className="min-h-0 overflow-y-auto p-4">
            {dateOpen ? (
              <DateEditor
                key={`${filters.uploadedFrom}:${filters.uploadedBefore}:${timeZone}`}
                filters={filters}
                timeZone={timeZone}
                onApply={onApply}
                onClose={() => setDateOpen(false)}
              />
            ) : null}
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    ),
  };
  return (
    <div
      aria-label="图片筛选条件"
      className="flex min-w-0 flex-wrap items-center gap-2"
      data-testid="library-filters-bar"
    >
      <Dropdown>
        <Button
          ref={addRef}
          variant="ghost"
          className="min-h-11 rounded-lg border border-dashed border-border px-3 text-sm"
        >
          <Plus className="size-4" />
          添加条件
        </Button>
        <Dropdown.Popover className="rounded-xl border border-border bg-surface">
          <Dropdown.Menu
            aria-label="添加筛选条件"
            onAction={(key) =>
              setAdded((current) => [...current, key as Category])
            }
          >
            {!available.length ? (
              <Dropdown.Item
                id="all-added"
                isDisabled
                textValue="已添加全部条件"
              >
                <Label>已添加全部条件</Label>
              </Dropdown.Item>
            ) : null}
            {available.map(({ id, name }) => (
              <Dropdown.Item
                key={id}
                id={id}
                textValue={name}
                className="min-h-11"
              >
                <Label>{name}</Label>
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      {visible.map(({ id, name }) => (
        <div
          key={id}
          data-filter-category={id}
          className="flex max-w-full min-w-0 items-center rounded-lg border border-border bg-surface"
        >
          {fields[id]}
          {id === 'albums' && fixedAlbumId ? null : (
            <Button
              isIconOnly
              variant="ghost"
              aria-label={`移除${name}条件`}
              className="size-11 min-h-11 min-w-11 shrink-0 rounded-lg"
              onPress={() => remove(id)}
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      ))}
      {visible.some(({ id }) => id !== 'albums' || !fixedAlbumId) ? (
        <Button
          variant="ghost"
          className="min-h-11 px-3 text-sm text-muted"
          onPress={() => {
            addRef.current?.focus();
            setAdded([]);
            setDateOpen(false);
            if (
              categories.some(
                ({ id }) => active[id] && (id !== 'albums' || !fixedAlbumId),
              )
            )
              onApply({
                tagId: [],
                uploadedFrom: null,
                uploadedBefore: null,
                visibility: null,
                status: null,
                storageId: null,
                albumId: fixedAlbumId ?? null,
                format: null,
              });
          }}
        >
          清除筛选条件
        </Button>
      ) : null}
    </div>
  );
}
