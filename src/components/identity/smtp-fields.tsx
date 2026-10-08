'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Badge,
  Hash,
  KeyRound,
  Mail,
  Server,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { FieldError } from '@heroui/react/field-error';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Select } from '@heroui/react/select';
import { TextField } from '@heroui/react/textfield';
import type { useSmtpPage } from './use-smtp-page';

type Editor = ReturnType<typeof useSmtpPage>;
const inputClass =
  'h-11 min-h-11 rounded-xl border border-border bg-background px-3.5 text-sm text-foreground shadow-none max-sm:text-base data-[invalid=true]:border-danger';

function SmtpField({
  editor,
  name,
  label,
  icon: Icon,
  type = 'text',
  placeholder,
}: {
  editor: Editor;
  name: 'host' | 'username' | 'password' | 'fromName' | 'fromEmail';
  label: string;
  icon: LucideIcon;
  type?: 'text' | 'email' | 'password';
  placeholder?: string;
}) {
  const testId = {
    host: 'host',
    username: 'username',
    password: 'password',
    fromName: 'from-name',
    fromEmail: 'from-email',
  }[name];
  return (
    <TextField
      name={name}
      value={editor.draft[name]}
      onChange={(value) => editor.change(name, value)}
      isDisabled={editor.locked}
      isInvalid={!!editor.errors[name]}
      validationBehavior="aria"
      className="grid gap-2"
    >
      <Label className="flex items-center gap-2 text-[13px] font-medium">
        <Icon className="size-4 shrink-0" aria-hidden />
        {label}
      </Label>
      <Input
        data-testid={`smtp-${testId}`}
        id={`smtp-${testId}`}
        type={type}
        autoComplete={type === 'password' ? 'new-password' : 'off'}
        autoCapitalize="none"
        spellCheck={false}
        placeholder={placeholder}
        className={inputClass + (editor.errors[name] ? ' border-danger' : '')}
      />
      <FieldError>{editor.errors[name]}</FieldError>
    </TextField>
  );
}
function SmtpMode({ editor }: { editor: Editor }) {
  return (
    <Select
      name="mode"
      value={editor.draft.mode}
      onChange={(value) => {
        if (value === 'tls' || value === 'starttls')
          editor.change('mode', value);
      }}
      isDisabled={editor.locked}
      isInvalid={!!editor.errors.mode}
      className="gap-2"
    >
      <Label className="flex items-center gap-2 text-[13px] font-medium">
        <ShieldCheck className="size-4" aria-hidden />
        连接安全
      </Label>
      <Select.Trigger
        data-testid="smtp-mode"
        className={inputClass + ' min-w-0'}
      >
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Item id="starttls" textValue="STARTTLS" className="min-h-11">
            STARTTLS
            <ListBox.ItemIndicator />
          </ListBox.Item>
          <ListBox.Item id="tls" textValue="TLS" className="min-h-11">
            TLS
            <ListBox.ItemIndicator />
          </ListBox.Item>
        </ListBox>
      </Select.Popover>
      <FieldError>{editor.errors.mode}</FieldError>
    </Select>
  );
}
function SmtpPort({ editor }: { editor: Editor }) {
  return (
    <TextField
      name="port"
      value={Number.isNaN(editor.draft.port) ? '' : String(editor.draft.port)}
      onChange={(value) =>
        editor.change('port', value === '' ? Number.NaN : Number(value))
      }
      isDisabled={editor.locked}
      isInvalid={!!editor.errors.port}
      validationBehavior="aria"
      className="grid gap-2"
    >
      <Label className="flex items-center gap-2 text-[13px] font-medium">
        <Hash className="size-4" aria-hidden />
        端口
      </Label>
      <Input
        data-testid="smtp-port"
        id="smtp-port"
        type="number"
        min={1}
        max={65535}
        step={1}
        inputMode="numeric"
        className={inputClass + (editor.errors.port ? ' border-danger' : '')}
      />
      <FieldError>{editor.errors.port}</FieldError>
    </TextField>
  );
}

export function SmtpFields({ editor }: { editor: Editor }) {
  return (
    <div data-testid="smtp-fields" className="grid gap-6">
      <div className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-5 sm:grid-cols-2 sm:gap-6">
        <div className="col-span-2 sm:col-span-1">
          <SmtpField
            editor={editor}
            name="host"
            label="SMTP 主机"
            icon={Server}
          />
        </div>
        <SmtpPort editor={editor} />
        <SmtpMode editor={editor} />
        <div className="col-span-2 sm:col-span-1">
          <SmtpField
            editor={editor}
            name="username"
            label="SMTP 用户名"
            icon={UserRound}
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <SmtpField
            editor={editor}
            name="fromName"
            label="发件人名称"
            icon={Badge}
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <SmtpField
            editor={editor}
            name="fromEmail"
            label="发件人邮箱"
            icon={Mail}
            type="email"
          />
        </div>
      </div>
      <div className="grid gap-2">
        <SmtpField
          editor={editor}
          name="password"
          label="SMTP 密码"
          icon={KeyRound}
          type="password"
          placeholder={
            editor.saved?.hasPassword
              ? '已设置 · 留空保留当前密码'
              : '未设置密码'
          }
        />
        <p className="text-[13px] leading-normal text-muted">
          测试仅使用已保存配置，收件人为当前所有者。
        </p>
      </div>
    </div>
  );
}
