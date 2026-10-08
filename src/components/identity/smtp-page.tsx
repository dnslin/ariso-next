'use client';

import type { ComponentProps } from 'react';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Form } from '@heroui/react/form';
import { Link } from '@heroui/react/link';
import { Spinner } from '@heroui/react/spinner';
import {
  CircleAlert,
  Eraser,
  LogIn,
  Mail,
  RefreshCw,
  Save,
  Send,
} from 'lucide-react';
import { OwnerShell } from '../shell/owner-shell';
import {
  SettingsCategories,
  SettingsHeading,
  settingsCategories,
} from '../shell/settings-categories';
import { SmtpDialog } from './smtp-dialog';
import { SmtpFields } from './smtp-fields';
import { SmtpTip } from './smtp-tip';
import { useSmtpPage } from './use-smtp-page';

type ShellProps = Omit<
  ComponentProps<typeof OwnerShell>,
  'children' | 'footer'
>;
const cardClass =
  'gap-6 rounded-[20px] border border-border bg-surface p-4 shadow-none sm:p-6';
const titles = {
  unknown: '操作结果待核对',
  'read-error': '未能读取当前设置',
  matched: '当前配置与输入一致',
  mismatch: '当前配置与输入不一致',
  'password-unknown': '密码变更无法确认',
  'clear-matched': '当前用户名和密码已清除',
};

function PendingSettings({
  editor,
}: {
  editor: ReturnType<typeof useSmtpPage>;
}) {
  if (!editor.pending) return null;
  const pending = editor.pending;
  const canResume =
    !editor.busy &&
    pending.state !== 'unknown' &&
    pending.state !== 'read-error';
  return (
    <div
      data-testid="smtp-pending"
      data-state={pending.state}
      role="status"
      className="grid gap-3 rounded-xl border border-border p-4"
    >
      <h3 className="text-sm font-medium">
        {editor.busy ? '正在核对当前设置…' : titles[pending.state]}
      </h3>
      <p className="text-[13px] leading-normal text-muted">{pending.message}</p>
      <div className="flex flex-wrap gap-3">
        {canResume ? (
          <Button
            data-testid="smtp-resume-current"
            variant="outline"
            onPress={() => editor.resume(true)}
            className="min-h-11 rounded-lg bg-background text-foreground"
          >
            {pending.state === 'matched' || pending.state === 'clear-matched'
              ? '继续编辑'
              : '从当前配置重新编辑'}
          </Button>
        ) : null}
        {canResume && pending.state === 'mismatch' ? (
          <Button
            data-testid="smtp-resume-draft"
            variant="outline"
            onPress={() => editor.resume(false)}
            className="min-h-11 rounded-lg bg-background text-foreground"
          >
            保留输入继续编辑
          </Button>
        ) : null}
        <Button
          data-testid="smtp-reload"
          variant="ghost"
          isDisabled={editor.busy}
          onPress={() => void editor.check()}
          className="min-h-11 gap-2 rounded-lg text-foreground"
        >
          {editor.busy ? (
            <Spinner size="sm" />
          ) : (
            <RefreshCw className="size-4" aria-hidden />
          )}
          重新读取设置
        </Button>
      </div>
    </div>
  );
}

export function SmtpPage(shell: ShellProps) {
  const editor = useSmtpPage();
  return (
    <OwnerShell
      {...shell}
      returnTo="/settings/email"
      onSessionExpire={editor.expire}
      footer={
        <>
          <Button
            data-testid="smtp-test"
            variant="outline"
            isDisabled={editor.locked || !editor.saved}
            onPress={editor.test}
            className="h-12 min-w-48 gap-2 rounded-xl bg-background text-foreground max-sm:min-w-0 max-sm:flex-1 max-sm:px-2"
          >
            {editor.operation === 'testing' ? (
              <Spinner size="sm" />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            {editor.operation === 'testing' ? '发送中…' : '发送测试邮件'}
          </Button>
          <Button
            data-testid="smtp-save"
            isDisabled={editor.locked || !editor.changed}
            onPress={() => void editor.save()}
            className="h-12 min-w-48 gap-2 rounded-xl max-sm:min-w-0 max-sm:flex-1 max-sm:px-2"
          >
            {editor.operation === 'saving' ? (
              <Spinner size="sm" />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            {editor.operation === 'saving' ? '保存中…' : '保存邮件设置'}
          </Button>
        </>
      }
    >
      <section
        data-testid="smtp-page"
        data-state={editor.load}
        data-operation={editor.operation}
        className="pb-10 [overflow-anchor:none]"
      >
        <SettingsHeading />
        <SettingsCategories items={settingsCategories}>
          {editor.load === 'loading' ? (
            <Card
              className={cardClass + ' min-h-72'}
              role="status"
              aria-label="正在读取邮件设置"
            >
              <h2 className="flex items-center gap-2 text-lg font-medium">
                <Spinner size="sm" />
                正在读取邮件设置
              </h2>
              <p className="text-sm text-muted">
                读取完成后即可查看与编辑当前配置。
              </p>
            </Card>
          ) : editor.load === 'session' || editor.load === 'error' ? (
            <Card className={cardClass}>
              <h2 className="flex items-center gap-2 text-lg font-medium">
                <CircleAlert className="size-5" aria-hidden />
                {editor.load === 'session' ? '会话已失效' : '无法读取邮件设置'}
              </h2>
              <p role="alert" className="text-sm text-danger">
                {editor.load === 'session'
                  ? '请重新登录后管理邮件服务。'
                  : editor.message}
              </p>
              {editor.load === 'session' ? (
                <Link
                  href="/login?reason=expired&returnTo=%2Fsettings%2Femail"
                  className="flex min-h-12 w-fit items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm text-foreground no-underline"
                >
                  <LogIn className="size-4" aria-hidden />
                  重新登录
                </Link>
              ) : (
                <Button
                  data-testid="smtp-reload"
                  variant="outline"
                  className="h-12 w-fit gap-2 rounded-lg bg-background text-foreground"
                  onPress={() => void editor.reload()}
                >
                  <RefreshCw className="size-4" aria-hidden />
                  重新读取
                </Button>
              )}
            </Card>
          ) : (
            <Card className={cardClass}>
              <header className="flex items-start justify-between gap-4 max-sm:flex-col max-sm:gap-3">
                <div className="grid gap-3">
                  <h2
                    id="smtp-heading"
                    tabIndex={-1}
                    className="flex items-center gap-2 text-lg font-medium"
                  >
                    <Mail className="size-5 shrink-0" aria-hidden />
                    SMTP 邮件服务
                  </h2>
                  <p className="text-[13px] leading-normal text-muted">
                    {editor.saved
                      ? '已保存配置 · 下次发送即生效'
                      : '尚未配置 · 请先保存，再发送测试邮件'}
                  </p>
                </div>
                {editor.saved &&
                (editor.saved.username || editor.saved.hasPassword) ? (
                  <div className="flex shrink-0 items-center gap-2 max-sm:self-end">
                    <Button
                      data-testid="smtp-clear"
                      variant="secondary"
                      isDisabled={editor.locked}
                      onPress={editor.openClear}
                      className="h-11 gap-2 rounded-lg border border-border text-foreground"
                    >
                      <Eraser className="size-4" aria-hidden />
                      清除用户名和密码
                    </Button>
                    <SmtpTip
                      key={editor.locked ? 'disabled' : 'available'}
                      disabled={editor.locked}
                    />
                  </div>
                ) : null}
              </header>
              <PendingSettings editor={editor} />
              <Form
                className="grid gap-6"
                validationBehavior="aria"
                onSubmit={(event) => {
                  event.preventDefault();
                  void editor.save();
                }}
              >
                <SmtpFields editor={editor} />
                {editor.message && !editor.pending ? (
                  <p
                    role="alert"
                    className="text-sm leading-normal text-danger"
                  >
                    {editor.message}
                  </p>
                ) : null}
                <p className="text-[13px] leading-normal text-muted">
                  编辑后请先保存，再发送测试邮件。保存无需重启，也不会自动发送邮件。
                </p>
              </Form>
            </Card>
          )}
        </SettingsCategories>
      </section>
      <SmtpDialog editor={editor} />
    </OwnerShell>
  );
}
