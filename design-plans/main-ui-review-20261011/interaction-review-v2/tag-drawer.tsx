'use client';

import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { Checkbox } from '@heroui/react/checkbox';
import { Drawer } from '@heroui/react/drawer';
import { FieldError } from '@heroui/react/field-error';
import { Input } from '@heroui/react/input';
import { InputGroup } from '@heroui/react/input-group';
import { TextField } from '@heroui/react/textfield';
import { Tooltip } from '@heroui/react/tooltip';
import { Check, Plus, Search, X } from 'lucide-react';
import { caseFold } from 'unicode-case-folding';
import { tagNameSchema } from '../../../src/server/collections/validation';

type TagDrawerProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  tags: { id: string; name: string; count: number }[];
  onApply: (names: string[]) => void;
  onCreate: (name: string) => { error?: string };
  mode?: 'add' | 'remove';
  error?: string;
};

function nameKey(value: string) {
  return caseFold(value.trim().normalize('NFC')).normalize('NFC');
}

export function TagDrawer({
  isOpen,
  onOpenChange,
  selectedCount,
  tags,
  onApply,
  onCreate,
  mode = 'add',
  error: applyError,
}: TagDrawerProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createdNames, setCreatedNames] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const action = mode === 'remove' ? '移除' : '添加';
  const choices = new Map(
    tags.map((tag) => [
      nameKey(tag.name),
      { name: tag.name, count: tag.count },
    ]),
  );
  for (const name of createdNames) {
    const key = nameKey(name);
    if (!choices.has(key)) choices.set(key, { name, count: 0 });
  }
  const filtered = [...choices].filter(([key]) => key.includes(nameKey(query)));
  const selectedNames = [...choices]
    .filter(([key]) => selected.has(key))
    .map(([, tag]) => tag.name);

  function createTag() {
    const parsed = tagNameSchema.safeParse(newName);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    const { displayName, normalizedKey } = parsed.data;
    if (choices.has(normalizedKey)) {
      setError('已有同名标签，请直接勾选');
      return;
    }
    const result = onCreate(displayName);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCreatedNames((current) => [...current, displayName]);
    setSelected((current) => new Set([...current, normalizedKey]));
    setNewName('');
    setQuery('');
    setError('');
    setNotice(`已创建并选中“${displayName}”`);
  }

  return (
    <Drawer.Backdrop
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      className="duration-200 motion-reduce:transition-none"
    >
      <Drawer.Content placement="right">
        <Drawer.Dialog
          data-testid="tag-drawer"
          className="h-full w-full max-w-full overflow-hidden border-l border-border bg-surface p-0 [--drawer-enter-duration:200ms] [--drawer-exit-duration:200ms] motion-reduce:transition-none sm:w-105 sm:max-w-full"
        >
          <Drawer.Header className="shrink-0 gap-4 border-b border-border px-5 pb-4 pt-3">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0">
                <Drawer.Heading className="text-lg font-semibold">
                  {action}标签
                </Drawer.Heading>
                <p className="mt-1 text-sm text-muted">
                  已选 {selectedCount} 张图片
                </p>
              </div>
              <Drawer.CloseTrigger
                aria-label={`关闭${action}标签`}
                className="static size-11 min-h-11 min-w-11 shrink-0 rounded-lg bg-transparent p-0"
              >
                <X size={18} aria-hidden />
              </Drawer.CloseTrigger>
            </div>
            <TextField aria-label="搜索标签" value={query} onChange={setQuery}>
              <InputGroup className="h-11 min-h-11 rounded-lg border border-border bg-background shadow-none">
                <InputGroup.Prefix className="pl-3">
                  <Search size={17} aria-hidden className="text-muted" />
                </InputGroup.Prefix>
                <InputGroup.Input
                  autoFocus
                  placeholder="搜索标签"
                  className="min-w-0 text-base md:text-sm"
                />
              </InputGroup>
            </TextField>
          </Drawer.Header>

          <Drawer.Body className="m-0 min-h-0 px-5 py-2 text-foreground">
            <div className="divide-y divide-border" aria-label="标签列表">
              {filtered.map(([key, tag]) => (
                <Checkbox
                  key={key}
                  aria-label={tag.name}
                  isSelected={selected.has(key)}
                  className="w-full max-w-none rounded-none p-0"
                  onChange={(checked) => {
                    setSelected((current) => {
                      const next = new Set(current);
                      if (checked) next.add(key);
                      else next.delete(key);
                      return next;
                    });
                    setNotice('');
                  }}
                >
                  <Checkbox.Content className="flex min-h-14 w-full min-w-0 items-center gap-3 py-3">
                    <Checkbox.Control className="size-5 shrink-0 rounded border border-border shadow-none">
                      <Checkbox.Indicator>
                        <Check size={14} aria-hidden />
                      </Checkbox.Indicator>
                    </Checkbox.Control>
                    <span className="min-w-0 flex-1 break-words text-sm [overflow-wrap:anywhere]">
                      {tag.name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {tag.count} 张
                    </span>
                  </Checkbox.Content>
                </Checkbox>
              ))}
            </div>
            {!filtered.length ? (
              <p role="status" className="py-10 text-center text-sm text-muted">
                {query ? '没有匹配的标签' : '暂无标签'}
              </p>
            ) : null}
          </Drawer.Body>

          {mode === 'add' ? (
            <form
              className="shrink-0 border-t border-border px-5 py-3"
              onSubmit={(event) => {
                event.preventDefault();
                createTag();
              }}
            >
              <div className="flex min-w-0 items-start gap-2">
                <TextField
                  aria-label="新标签名称"
                  value={newName}
                  onChange={(value) => {
                    setNewName(value);
                    setError('');
                    setNotice('');
                  }}
                  isInvalid={Boolean(error)}
                  className="min-w-0 flex-1"
                >
                  <Input
                    placeholder="新建标签"
                    className="h-11 min-h-11 w-full min-w-0 rounded-lg border border-border bg-background text-base shadow-none md:text-sm"
                  />
                  <FieldError className="text-sm">{error}</FieldError>
                </TextField>
                <Tooltip>
                  <Button
                    isIconOnly
                    type="submit"
                    variant="outline"
                    aria-label="创建标签"
                    isDisabled={!newName.trim()}
                    className="size-11 min-h-11 min-w-11 shrink-0 rounded-lg p-0"
                  >
                    <Plus size={18} aria-hidden />
                  </Button>
                  <Tooltip.Content>创建标签</Tooltip.Content>
                </Tooltip>
              </div>
              {notice ? (
                <p role="status" className="mt-2 text-xs text-muted">
                  {notice}
                </p>
              ) : null}
            </form>
          ) : null}

          {applyError ? (
            <p role="alert" className="shrink-0 px-5 py-3 text-sm text-danger">
              {applyError}
            </p>
          ) : null}

          <Drawer.Footer className="m-0 shrink-0 gap-2 border-t border-border px-5 py-4 pb-[max(16px,env(safe-area-inset-bottom))]">
            <span role="status" className="mr-auto text-sm text-muted">
              已选 {selectedNames.length} 个
            </span>
            <Button
              slot="close"
              variant="ghost"
              className="h-11 min-h-11 rounded-lg px-4 text-sm"
            >
              取消
            </Button>
            <Button
              isDisabled={!selectedNames.length}
              className="h-11 min-h-11 rounded-lg px-5 text-sm"
              onPress={() => onApply(selectedNames)}
            >
              {action}
            </Button>
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}
