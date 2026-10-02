'use client';

import { useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Popover } from '@heroui/react/popover';
import { SearchField } from '@heroui/react/search-field';
import { Tag } from '@heroui/react/tag';
import { TagGroup } from '@heroui/react/tag-group';
import { ChevronDown } from 'lucide-react';
import type { UploadRelation } from './types';

/** The same searchable multiple-selection interaction for albums and tags. */
export function UploadRelations({
  kind,
  choices,
  selected,
  onChange,
  onCreate,
  onRefresh,
  loading,
  error,
}: {
  kind: 'albums' | 'tags';
  choices: UploadRelation[];
  selected: UploadRelation[];
  onChange: (items: UploadRelation[]) => void;
  onCreate: () => void;
  onRefresh: () => Promise<unknown>;
  loading: boolean;
  error: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const label = kind === 'albums' ? '相册' : '标签';
  const choicesById = new Map(choices.map((item) => [item.id, item]));
  const sameNames = new Set<string>();
  if (kind === 'albums') {
    const names = new Set<string>();
    const allChoices = [
      ...choices,
      ...selected.filter((item) => !choicesById.has(item.id)),
    ];
    for (const item of allChoices) {
      if (names.has(item.name)) sameNames.add(item.name);
      else names.add(item.name);
    }
  }
  const display = (item: UploadRelation) => {
    const current = choicesById.get(item.id);
    const name = current?.name ?? item.name;
    const identity =
      kind === 'albums' && sameNames.has(name) ? `${name} · ${item.id}` : name;
    return current ? identity : `${identity}（已不存在）`;
  };
  const searchTerm = search.trim().toLocaleLowerCase();
  const matching = choices.filter((item) =>
    `${item.name} ${item.id}`.toLocaleLowerCase().includes(searchTerm),
  );
  const matchingIds = new Set(matching.map((item) => item.id));
  return (
    <div data-testid={`upload-${kind}`} className="grid min-w-0 gap-2">
      <Label id={`upload-${kind}-label`}>{label}</Label>
      <Popover
        isOpen={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) void onRefresh();
        }}
      >
        <Button
          ref={trigger}
          aria-label={`选择${label}`}
          variant="outline"
          className="min-h-11 w-full justify-between rounded-lg px-3 text-left text-sm font-normal data-[pressed=true]:transform-none"
        >
          {selected.length
            ? `已选择 ${selected.length} 个${label}`
            : `选择${label}（可多选）`}
          <ChevronDown aria-hidden className="size-4 shrink-0" />
        </Button>
        <Popover.Content
          placement="bottom start"
          isNonModal
          className="w-[min(358px,calc(100vw-32px))] max-h-[calc(var(--visual-viewport-height)-32px)] overflow-y-auto rounded-xl border border-border bg-surface p-0 md:w-78"
        >
          <Popover.Dialog
            aria-label={`选择${label}`}
            className="grid gap-3 p-3"
          >
            {loading ? (
              <p role="status" className="text-sm">
                正在更新{label}列表…
              </p>
            ) : error ? (
              <div className="grid gap-2 text-sm">
                <p role="alert">列表更新失败：{error}。已有选择保留。</p>
                <Button
                  variant="outline"
                  className="min-h-11 rounded-lg"
                  onPress={() => {
                    void onRefresh();
                  }}
                >
                  重试读取列表
                </Button>
              </div>
            ) : null}
            <SearchField
              value={search}
              onChange={setSearch}
              aria-label={`搜索${label}`}
            >
              <SearchField.Group
                className="min-h-11 rounded-lg border border-border bg-background"
                onClick={(event) => {
                  if (event.target === event.currentTarget)
                    event.currentTarget.querySelector('input')?.focus();
                }}
              >
                <SearchField.SearchIcon />
                <SearchField.Input
                  autoFocus
                  placeholder={`搜索${label}名称${kind === 'albums' ? '或 ID' : ''}`}
                  className="min-w-0 text-base md:text-sm"
                />
                <SearchField.ClearButton
                  aria-label={`清空${label}搜索`}
                  className="size-11 shrink-0"
                />
              </SearchField.Group>
            </SearchField>
            <ListBox
              aria-label={`${label}列表`}
              selectionMode="multiple"
              selectionBehavior="toggle"
              escapeKeyBehavior="none"
              selectedKeys={selected.map((item) => item.id)}
              onSelectionChange={(keys) => {
                const retained = selected.filter(
                  (item) => !matchingIds.has(item.id),
                );
                const visible = matching.filter(
                  (item) => keys === 'all' || keys.has(item.id),
                );
                onChange([...retained, ...visible]);
              }}
              renderEmptyState={() => (
                <p className="p-3 text-sm">
                  {choices.length
                    ? '没有匹配结果'
                    : `暂无${label}，可新建后选择。`}
                </p>
              )}
              className="max-h-60 overflow-y-auto"
            >
              {matching.map((item) => (
                <ListBox.Item
                  key={item.id}
                  id={item.id}
                  data-relation-id={item.id}
                  textValue={display(item)}
                  className="min-h-11 gap-2 text-sm [overflow-wrap:anywhere]"
                >
                  <span className="min-w-0 flex-1">{display(item)}</span>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
            <Button
              variant="outline"
              className="min-h-11 w-full rounded-lg"
              onPress={() => {
                setOpen(false);
                trigger.current?.focus();
                onCreate();
              }}
            >
              新建{label}
            </Button>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
      {selected.length ? (
        <TagGroup
          aria-label={`已选${label}`}
          onRemove={(keys) =>
            onChange(selected.filter((item) => !keys.has(item.id)))
          }
        >
          <TagGroup.List className="flex min-w-0 flex-wrap gap-2">
            {selected.map((item) => (
              <Tag
                key={item.id}
                id={item.id}
                data-relation-id={item.id}
                textValue={display(item)}
                className="min-h-11 h-auto max-w-full rounded-lg bg-default py-0 pl-3 pr-0 text-sm"
              >
                <span className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">
                  {display(item)}
                </span>
                <Tag.RemoveButton
                  aria-label={`移除${label} ${display(item)}`}
                  className="min-h-11 min-w-11 shrink-0"
                />
              </Tag>
            ))}
          </TagGroup.List>
        </TagGroup>
      ) : null}
    </div>
  );
}
