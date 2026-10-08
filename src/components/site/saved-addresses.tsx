'use client';

import { createElement, useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { TextField } from '@heroui/react/textfield';
import { TextArea } from '@heroui/react/textarea';
import { Label } from '@heroui/react/label';
import { toast } from '@heroui/react/toast';
import { Check, Copy } from 'lucide-react';
import type { SiteSettingsResponse } from './api';

export function SavedAddresses({ saved }: { saved: SiteSettingsResponse }) {
  const [manual, setManual] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const notification = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (notification.current) toast.close(notification.current);
    };
  }, []);
  async function copy(value: string) {
    if (notification.current) toast.close(notification.current);
    notification.current = null;
    try {
      await navigator.clipboard.writeText(value);
      if (!mounted.current) return;
      setManual(null);
      notification.current = toast('地址已复制', {
        variant: 'default',
        indicator: createElement(Check, {
          className: 'size-4',
          'aria-hidden': true,
        }),
      });
    } catch {
      if (mounted.current) setManual(value);
    }
  }
  return (
    <div className="grid min-w-0 gap-3">
      {[
        {
          label: '当前公开地址',
          value: saved.publicUrl,
          testId: 'site-saved-url',
          aria: '复制当前公开地址',
        },
        {
          label: 'GitHub OAuth 回调',
          value: saved.githubCallbackUrl,
          testId: 'site-callback-url',
          aria: '复制 GitHub 回调地址',
        },
      ].map(({ label, value, testId, aria }) => (
        <div key={testId} className="grid min-w-0 gap-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">{label}</span>
            <Button
              type="button"
              variant="outline"
              isIconOnly
              aria-label={aria}
              className="size-11 min-w-11 shrink-0 rounded-lg bg-background"
              onPress={() => void copy(value)}
            >
              <Copy className="size-4" aria-hidden />
            </Button>
          </div>
          <p
            data-testid={testId}
            className="select-text text-[13px] leading-5 wrap-anywhere"
          >
            {value}
          </p>
        </div>
      ))}
      {manual !== null ? (
        <div className="grid gap-2">
          <p role="alert" className="text-sm text-danger">
            自动复制失败，请选择下方完整文本手动复制。
          </p>
          <TextField isReadOnly value={manual} aria-label="完整手动复制文本">
            <Label className="sr-only">完整手动复制文本</Label>
            <TextArea
              ref={field}
              rows={3}
              className="min-h-20 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] shadow-none"
            />
          </TextField>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-fit rounded-lg"
            onPress={() => {
              field.current?.focus();
              field.current?.select();
            }}
          >
            选择完整文本
          </Button>
        </div>
      ) : null}
    </div>
  );
}
