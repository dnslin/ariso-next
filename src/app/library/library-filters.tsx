'use client';

import { useEffect, useState } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { DateField } from '@heroui/react/date-field';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Modal } from '@heroui/react/modal';
import { I18nProvider } from '@heroui/react/rac';
import { Select } from '@heroui/react/select';
import {
  parseAbsolute,
  toCalendarDate,
  type CalendarDate,
} from '@internationalized/date';
import { ChevronDown, X } from 'lucide-react';
import { libraryDateRange } from '../../server/library/query-dates';
import type { LibraryFilters } from '../../server/library/query-schema';
import type { LibraryQueryPatch } from './query-state';
import { LibraryFilterOptionsField } from './library-filter-options';

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
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
      className="w-full gap-2"
      value={value ?? ''}
      onChange={(value) => onChange(value ? (String(value) as T) : null)}
    >
      <Label className="text-[13px] font-normal leading-5">{label}</Label>
      <Select.Trigger className="h-11 min-h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base shadow-none md:text-sm">
        <Select.Value />
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

function FilterFields({
  filters,
  timeZone,
  fixedAlbumId,
  onApply,
  onOpenChange,
  onSessionExpired,
}: Omit<Props, 'isOpen'>) {
  const [client] = useState(() => new QueryClient());
  useEffect(() => () => client.clear(), [client]);
  const [draft, setDraft] = useState(filters);
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
      const dates = filterDateBounds(
        filters,
        fromEdited ? (from?.toString() ?? null) : undefined,
        throughEdited ? (through?.toString() ?? null) : undefined,
        timeZone,
      );
      onApply({
        tagId: draft.tagIds,
        albumId: fixedAlbumId ?? draft.albumId,
        storageId: draft.storageId,
        format: draft.format,
        visibility: draft.visibility,
        status: draft.status,
        ...dates,
      });
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  return (
    <form onSubmit={apply} className="flex min-h-0 flex-col gap-3">
      <Modal.Header className="flex h-11 shrink-0 flex-row items-center justify-between md:h-8">
        <Modal.Heading className="text-lg font-medium leading-normal">
          筛选图片
        </Modal.Heading>
        <Button
          isIconOnly
          variant="ghost"
          aria-label="关闭筛选"
          className="size-11 min-h-11 min-w-11 rounded-xl"
          onPress={() => onOpenChange(false)}
        >
          <X className="size-4" />
        </Button>
      </Modal.Header>
      <Modal.Body className="m-0 h-102 min-h-0 flex-none shrink overflow-y-auto p-0 pb-1 text-foreground">
        <div className="flex min-w-0 flex-col gap-3">
          <LibraryFilterOptionsField
            kind="tags"
            label="标签（匹配任意一个）"
            selectedIds={draft.tagIds}
            onChange={(tagIds) => setDraft({ ...draft, tagIds })}
            client={client}
            onSessionExpired={onSessionExpired}
          />
          <div className="flex flex-col gap-1.5">
            <p className="text-sm leading-[22px]">上传日期 · {timeZone}</p>
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
              <p className="text-xs text-muted">
                当前时间边界（{timeZone}）：
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
                （不含）；仅修改日期时重新计算。
              </p>
            ) : null}
          </div>
          <Choice
            label="可见性"
            value={draft.visibility}
            onChange={(visibility) => setDraft({ ...draft, visibility })}
            options={[
              { id: 'public', name: '公开' },
              { id: 'private', name: '私有' },
            ]}
          />
          <Choice
            label="处理状态"
            value={draft.status}
            onChange={(status) => setDraft({ ...draft, status })}
            options={[
              { id: 'pending', name: '等待处理' },
              { id: 'processing', name: '处理中' },
              { id: 'ready', name: '已就绪' },
              { id: 'failed', name: '处理失败' },
            ]}
          />
          <LibraryFilterOptionsField
            kind="storages"
            label="存储位置"
            selectedIds={draft.storageId ? [draft.storageId] : []}
            onChange={(ids) =>
              setDraft({ ...draft, storageId: ids[0] ?? null })
            }
            client={client}
            onSessionExpired={onSessionExpired}
          />
          <LibraryFilterOptionsField
            kind="albums"
            label="相册"
            selectedIds={
              fixedAlbumId
                ? [fixedAlbumId]
                : draft.albumId
                  ? [draft.albumId]
                  : []
            }
            onChange={(ids) => setDraft({ ...draft, albumId: ids[0] ?? null })}
            client={client}
            onSessionExpired={onSessionExpired}
            disabled={!!fixedAlbumId}
          />
          <Choice
            label="格式"
            value={draft.format}
            onChange={(format) => setDraft({ ...draft, format })}
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
        </div>
      </Modal.Body>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Modal.Footer className="mt-0 flex shrink-0 justify-end pt-2">
        <Button
          type="submit"
          className="h-11 min-h-11 w-40 rounded-xl bg-accent text-sm font-normal text-accent-foreground md:w-29"
        >
          应用筛选
        </Button>
      </Modal.Footer>
    </form>
  );
}

export function LibraryFiltersDialog(props: Props) {
  return (
    <Modal.Backdrop isOpen={props.isOpen} onOpenChange={props.onOpenChange}>
      <Modal.Container
        placement="center"
        scroll="inside"
        className="w-full p-4 sm:w-full sm:p-4"
      >
        <Modal.Dialog className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-0 overflow-hidden rounded-3xl bg-surface px-4 py-5 shadow-[0_16px_48px_rgba(38,36,66,0.16)] md:p-6">
          {props.isOpen ? <FilterFields {...props} /> : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
