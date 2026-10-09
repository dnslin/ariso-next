'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { Form } from '@heroui/react/form';
import { Link } from '@heroui/react/link';
import { Spinner } from '@heroui/react/spinner';
import { accountInputSchema } from '../../server/identity/validation';
import { IdentityField } from './identity-field';
import { resetRequest } from './reset-request';
import { recoveryActionClass } from './recovery-frame';
import { ResetPasswordResult } from './reset-password-result';

export function ResetPasswordForm({
  token,
  valid,
}: {
  token: string;
  valid: boolean;
}) {
  const [state, setState] = useState<
    'form' | 'pending' | 'success' | 'invalid' | 'unknown'
  >(valid ? 'form' : 'invalid');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState('');
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const initial = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    document.getElementById('reset-heading')?.focus();
  }, [state]);

  async function submit() {
    if (inFlight.current) return;
    const parsed = accountInputSchema.shape.password.safeParse(newPassword);
    const invalid = {
      ...(!parsed.success
        ? { newPassword: parsed.error.issues[0].message }
        : {}),
      ...(newPassword !== confirmPassword
        ? { confirmPassword: '两次输入的密码不一致' }
        : {}),
    };
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      document.getElementById(Object.keys(invalid)[0])?.focus();
      return;
    }
    inFlight.current = true;
    setState('pending');
    const result = await resetRequest('reset-password', { token, newPassword });
    inFlight.current = false;
    if (!mounted.current) return;
    setNewPassword('');
    setConfirmPassword('');
    window.history.replaceState(window.history.state, '', '/reset-password');
    if (result.ok) {
      setState('success');
      return;
    }
    setDetail(
      result.status ? `HTTP ${result.status} / ${result.code}` : '连接中断',
    );
    setState(result.code === 'INVALID_TOKEN' ? 'invalid' : 'unknown');
  }

  const busy = state === 'pending';
  const validationMessage = Object.values(errors).find(Boolean);
  return (
    <section
      data-testid="reset-page"
      data-state={state}
      aria-labelledby="reset-heading"
      aria-busy={busy}
      className="grid w-full min-w-0 gap-[18px] rounded-3xl border border-border bg-surface px-5 py-6 min-[768px]:px-7"
    >
      {state === 'form' || busy ? (
        <>
          <h1
            id="reset-heading"
            tabIndex={-1}
            className="text-2xl leading-[30px] font-medium"
          >
            {busy
              ? '正在重置密码'
              : validationMessage
                ? '请检查两次输入'
                : '设置新密码'}
          </h1>
          <p
            className={`${validationMessage && !busy ? 'text-danger' : 'text-muted'} min-h-[30px] text-sm leading-[1.5]`}
            role={busy ? 'status' : validationMessage ? 'alert' : undefined}
          >
            {busy
              ? '请稍候，正在保存你的新密码。'
              : validationMessage
                ? errors.confirmPassword && !errors.newPassword
                  ? '两次输入的密码不一致，请修改后重试。'
                  : validationMessage
                : '为你的账号设置一个新密码。'}
          </p>
          <Form
            className="grid gap-[18px]"
            validationBehavior="aria"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="grid gap-3.5 [&_label]:min-h-[30px] [&_.field-error]:min-h-[30px] [&_.textfield]:gap-2">
              <IdentityField
                name="newPassword"
                label="新密码"
                value={newPassword}
                onChange={(value) => {
                  setNewPassword(value);
                  setErrors((current) => ({ ...current, newPassword: '' }));
                }}
                error={errors.newPassword}
                secret
                autoComplete="new-password"
                isDisabled={busy}
              />
              <IdentityField
                name="confirmPassword"
                label="确认新密码"
                value={confirmPassword}
                onChange={(value) => {
                  setConfirmPassword(value);
                  setErrors((current) => ({ ...current, confirmPassword: '' }));
                }}
                error={errors.confirmPassword}
                secret
                autoComplete="new-password"
                isDisabled={busy}
              />
            </div>
            <p className="text-muted min-h-[30px] text-xs leading-[1.5]">
              8–128 个字符，首尾空格也会计入密码。
            </p>
            <Button
              data-testid="reset-submit"
              type="submit"
              className={recoveryActionClass}
              variant={busy ? 'outline' : 'primary'}
              isDisabled={busy}
            >
              {busy ? <Spinner size="sm" /> : null}
              {busy ? '正在重置…' : '重置密码'}
            </Button>
          </Form>
          {!busy ? (
            <>
              <Link
                href="/login"
                data-testid="reset-login"
                className={`${recoveryActionClass} border border-border bg-background text-foreground`}
              >
                返回登录
              </Link>
              {!validationMessage ? (
                <p className="text-muted min-h-[30px] text-xs leading-[1.5]">
                  重置后需要重新登录，不会自动进入后台。
                </p>
              ) : null}
            </>
          ) : null}
        </>
      ) : (
        <ResetPasswordResult state={state} detail={detail} />
      )}
    </section>
  );
}
