'use client';

import { createElement, useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { Label } from '@heroui/react/label';
import { TextArea } from '@heroui/react/textarea';
import { TextField } from '@heroui/react/textfield';
import { toast } from '@heroui/react/toast';
import { Check, Copy } from 'lucide-react';

export function GithubCallbackCopy({
  url,
  isDisabled,
}: {
  url: string;
  isDisabled: boolean;
}) {
  const [manual, setManual] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setManual(false);
      toast('回调地址已复制', {
        variant: 'default',
        indicator: createElement(Check, {
          className: 'size-5',
          'aria-hidden': true,
        }),
      });
    } catch {
      setManual(true);
    }
  }
  return (
    <div className="grid min-w-0 gap-1.5">
      <p className="text-sm">回调地址</p>
      <div className="flex min-w-0 items-start gap-2">
        <p
          data-testid="oauth-callback-url"
          className="min-w-0 flex-1 self-center wrap-anywhere text-[13px] leading-normal"
        >
          {url}
        </p>
        <Button
          type="button"
          isIconOnly
          variant="outline"
          isDisabled={isDisabled}
          aria-label="复制 GitHub 回调地址"
          className="size-11 min-w-11 shrink-0 rounded-lg bg-background"
          onPress={() => void copy()}
        >
          <Copy className="size-4" aria-hidden />
        </Button>
      </div>
      {manual ? (
        <div className="grid gap-1.5">
          <p role="alert" className="text-[13px] text-danger leading-normal">
            自动复制失败，请选择下方完整地址手动复制。
          </p>
          <TextField
            isReadOnly
            value={url}
            aria-label="完整回调地址"
            isDisabled={isDisabled}
          >
            <Label className="sr-only">完整回调地址</Label>
            <TextArea
              ref={field}
              data-testid="oauth-manual-copy"
              rows={2}
              className="min-h-16 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] shadow-none"
            />
          </TextField>
          <Button
            type="button"
            variant="outline"
            isDisabled={isDisabled}
            className="min-h-11 w-fit rounded-lg bg-background px-3 text-sm font-normal"
            onPress={() => {
              field.current?.focus();
              field.current?.select();
            }}
          >
            选择完整回调地址
          </Button>
        </div>
      ) : null}
    </div>
  );
}
