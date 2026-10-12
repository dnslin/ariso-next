'use client';

import { Button } from '@heroui/react/button';
import { FieldError } from '@heroui/react/field-error';
import { Input } from '@heroui/react/input';
import { TextField } from '@heroui/react/textfield';
import { Tooltip } from '@heroui/react/tooltip';
import { Plus } from 'lucide-react';
import type { useTagTargetCreate } from './use-tag-target-create';

export function TagTargetCreate({
  create,
  disabled,
}: {
  create: ReturnType<typeof useTagTargetCreate>;
  disabled: boolean;
}) {
  return (
    <form
      data-testid="batch-create-tag"
      className="grid shrink-0 gap-2 border-t border-border pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        void create.create();
      }}
    >
      <div className="flex min-w-0 items-start gap-2">
        <TextField
          aria-label="新标签名称"
          value={create.name}
          onChange={create.change}
          isInvalid={Boolean(create.error)}
          isDisabled={disabled || create.pending || create.unknown}
          className="min-w-0 flex-1"
          validationBehavior="aria"
        >
          <Input
            placeholder="新建标签"
            className="h-11 min-h-11 w-full min-w-0 rounded-lg border border-border bg-background text-base shadow-none md:text-sm"
          />
          <FieldError className="text-sm">{create.error}</FieldError>
        </TextField>
        <Tooltip>
          <Button
            type="submit"
            isIconOnly
            variant="outline"
            aria-label="创建标签"
            isDisabled={
              disabled ||
              create.pending ||
              create.unknown ||
              !create.name.trim()
            }
            className="size-11 min-h-11 min-w-11 shrink-0 rounded-lg p-0"
          >
            <Plus size={18} aria-hidden />
          </Button>
          <Tooltip.Content>创建标签</Tooltip.Content>
        </Tooltip>
      </div>
      {create.duplicate ? (
        <Button
          variant="ghost"
          className="h-auto min-h-11 w-fit max-w-full justify-start whitespace-normal rounded-lg py-2 text-left text-sm [overflow-wrap:anywhere]"
          isDisabled={disabled || create.pending}
          onPress={create.selectExisting}
        >
          选择现有标签：{create.duplicate.displayName}
        </Button>
      ) : null}
      {create.unknown ? (
        <Button
          variant="outline"
          className="h-11 min-h-11 w-fit rounded-lg text-sm"
          isDisabled={disabled || create.pending}
          onPress={() => void create.check()}
        >
          {create.pending ? '正在核对…' : '核对新建结果'}
        </Button>
      ) : null}
      {create.notice ? (
        <p role="status" className="text-xs text-muted">
          {create.notice}
        </p>
      ) : null}
    </form>
  );
}
