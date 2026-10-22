'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Label } from '@heroui/react/label';
import { Link } from '@heroui/react/link';
import { ListBox } from '@heroui/react/list-box';
import { Select } from '@heroui/react/select';
import { TextArea } from '@heroui/react/textarea';
import {
  Check,
  Clock3,
  Copy,
  ExternalLink,
  Share2,
  Unlink,
} from 'lucide-react';
import type {
  OwnerImageShare,
  OwnerImageShareSettings,
} from '../../server/sharing/image-configuration';

export function ImageShareNotice({
  children,
  danger = false,
}: {
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <Alert
      status={danger ? 'danger' : 'accent'}
      role={danger ? 'alert' : 'status'}
      className={`gap-2.5 rounded-xl border p-3 shadow-none ${danger ? 'border-danger/40 bg-danger/5' : 'border-border bg-default/40'}`}
    >
      <Alert.Indicator
        aria-hidden
        className={`mt-0.5 shrink-0 p-0 [&_svg]:size-[18px] ${danger ? 'text-danger' : 'text-foreground'}`}
      />
      <Alert.Content className="min-w-0">
        <Alert.Description
          className={`text-[13px] leading-6 [overflow-wrap:anywhere] ${danger ? 'text-danger' : 'text-foreground'}`}
        >
          {children}
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

export function ImageShareActive({
  share,
  timeZone,
  disabled,
  onRevoke,
}: {
  share: OwnerImageShare;
  timeZone: string;
  disabled: boolean;
  onRevoke: () => void;
}) {
  const [message, setMessage] = useState<'copied' | 'manual' | null>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const deadline = new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false,
  }).format(new Date(share.expiresAt));
  async function copy() {
    try {
      await navigator.clipboard.writeText(share.url);
      setMessage('copied');
    } catch {
      setMessage('manual');
      text.current?.focus();
      text.current?.select();
    }
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Check size={18} aria-hidden />
        <span className="font-medium">分享已创建</span>
        <span className="ml-auto flex items-center gap-1 text-xs text-muted">
          <Clock3 size={15} aria-hidden />
          {deadline} 到期（{timeZone}）
        </span>
      </div>
      <div className="grid gap-2">
        <Label>临时查看地址</Label>
        <TextArea
          ref={text}
          aria-label="临时查看地址"
          value={share.url}
          readOnly
          className="min-h-20 w-full resize-none break-all rounded-lg border border-border bg-transparent p-3 font-mono text-xs"
        />
      </div>
      {message === 'manual' ? (
        <ImageShareNotice>浏览器未允许自动复制，请手动复制。</ImageShareNotice>
      ) : message === 'copied' ? (
        <p role="status" className="text-xs text-muted">
          已复制查看地址
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-3">
        <Button
          className="min-h-12 rounded-lg"
          isDisabled={disabled}
          onPress={() => {
            void copy();
          }}
        >
          <Copy size={17} aria-hidden />
          复制地址
        </Button>
        <Link
          href={share.url}
          target="_blank"
          rel="noreferrer"
          className="min-h-12 gap-2 rounded-lg border border-border bg-default px-4 text-sm text-foreground no-underline"
        >
          <ExternalLink size={17} aria-hidden />
          预览访客页
        </Link>
      </div>
      <ImageShareNotice>
        替换原图、回收或改为公开会永久撤销此地址。已经显示或保存的图片无法收回。
      </ImageShareNotice>
      <Button
        variant="ghost"
        className="min-h-11 w-fit gap-2 px-1 text-danger"
        isDisabled={disabled}
        onPress={onRevoke}
      >
        <Unlink size={17} aria-hidden />
        撤销分享
      </Button>
    </>
  );
}

export function ImageShareCreate({
  settings,
  disabled,
  pending,
  onCreate,
}: {
  settings: OwnerImageShareSettings;
  disabled: boolean;
  pending: boolean;
  onCreate: (hours: number) => void;
}) {
  const [hours, setHours] = useState('24');
  return (
    <>
      {settings.share ? (
        <p role="status" className="text-xs text-muted">
          {settings.share.state === 'expired'
            ? '上次分享已过期。'
            : '上次分享已撤销。'}
          重新创建会使用新地址，旧地址不会恢复。
        </p>
      ) : null}
      <Select
        aria-label="分享有效期"
        value={hours}
        isDisabled={disabled}
        onChange={(value) => {
          if (value) setHours(String(value));
        }}
      >
        <Label>有效期</Label>
        <Select.Trigger className="min-h-12 min-w-0 rounded-lg border border-border bg-transparent text-sm shadow-none">
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {[
              ['1', '1 小时'],
              ['24', '24 小时'],
              ['168', '7 天'],
            ].map(([value, label]) => (
              <ListBox.Item
                key={value}
                id={value}
                textValue={label}
                className="min-h-11"
              >
                {label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      <p className="text-xs text-muted">到期后，新访问会被拒绝。</p>
      <ImageShareNotice>
        图片保持私有，普通图片外链仍需登录。持有临时地址的人可以查看并保存已显示的图片。
      </ImageShareNotice>
      <Button
        className="min-h-12 justify-self-end rounded-lg"
        isDisabled={
          disabled || !!settings.unavailableReason || !settings.sourceVersion
        }
        isPending={pending}
        onPress={() => onCreate(Number(hours))}
      >
        <Share2 size={17} aria-hidden />
        {settings.share ? '重新创建分享' : '创建分享'}
      </Button>
    </>
  );
}
