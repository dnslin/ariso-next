'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { Form } from '@heroui/react/form';
import { Link } from '@heroui/react/link';
import { accountInputSchema } from '../../server/identity/validation';
import { IdentityField } from './identity-field';
import { resetRequest } from './reset-request';
import { RecoveryFrame, recoveryActionClass } from './recovery-frame';
import {
  RecoveryStatus,
  recoveryTitles,
  type RecoveryState,
} from './recovery-status';

export function ForgotPasswordForm({
  smtpConfigured,
  cli,
}: {
  smtpConfigured: boolean;
  cli: boolean;
}) {
  const [state, setState] = useState<RecoveryState>(
    cli ? 'cli' : smtpConfigured ? 'form' : 'unconfigured',
  );
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [detail, setDetail] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const inFlight = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const initial = useRef(true);
  useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    heading.current?.focus();
  }, [state]);
  useEffect(() => {
    if (!retryAt) return;
    const update = () =>
      setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);

  async function submit() {
    if (inFlight.current || Date.now() < retryAt) return;
    const parsed = accountInputSchema.shape.email.safeParse(email);
    if (!parsed.success) {
      setError('请输入有效邮箱');
      document.getElementById('email')?.focus();
      return;
    }
    inFlight.current = true;
    setState('pending');
    const result = await resetRequest('request-password-reset', {
      email: parsed.data,
    });
    inFlight.current = false;
    if (result.ok) {
      setState('accepted');
      return;
    }
    setDetail(
      result.status ? `HTTP ${result.status} / ${result.code}` : '连接中断',
    );
    setRetryAt(result.retryAt);
    setRemaining(Math.max(0, Math.ceil((result.retryAt - Date.now()) / 1000)));
    setState(
      result.code === 'SMTP_NOT_CONFIGURED'
        ? 'unconfigured'
        : result.status === 429
          ? 'rate-limited'
          : ['RESET_EMAIL_DELIVERY_UNKNOWN', 'RESULT_UNKNOWN'].includes(
                result.code,
              )
            ? 'unknown'
            : 'error',
    );
  }

  return (
    <RecoveryFrame
      state={state === 'form' && error ? 'email-error' : state}
      title={state === 'form' && error ? '检查邮箱地址' : recoveryTitles[state]}
      headingRef={heading}
    >
      {state === 'form' ? (
        <>
          <p>
            {error
              ? '请输入用于登录的邮箱。'
              : '输入登录邮箱，接收密码重置邮件。'}
          </p>
          <Form
            validationBehavior="aria"
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <IdentityField
              name="email"
              label="邮箱"
              value={email}
              onChange={(value) => {
                setEmail(value);
                setError('');
              }}
              error={error}
              autoComplete="username"
              icon={error ? undefined : 'email'}
              layout={error ? 'setup' : 'login'}
              placeholder="name@example.com"
            />
            <Button
              data-testid="reset-submit"
              type="submit"
              className={
                error
                  ? recoveryActionClass
                  : 'h-11 min-h-11 w-full rounded-lg text-sm font-normal min-[1200px]:h-9 min-[1200px]:min-h-9'
              }
            >
              发送重置邮件
            </Button>
          </Form>
          <Link
            href="/login"
            data-testid="reset-login"
            className={
              error
                ? recoveryActionClass
                : 'flex min-h-11 w-full items-center justify-center rounded-lg text-sm font-normal min-[1200px]:min-h-9'
            }
          >
            {error ? '返回登录' : '想起密码了？返回登录'}
          </Link>
          {!error ? (
            <Link
              href="/forgot-password?view=cli"
              data-testid="reset-cli"
              className={recoveryActionClass}
            >
              无法收邮件？查看终端恢复方法
            </Link>
          ) : null}
        </>
      ) : (
        <RecoveryStatus
          state={state}
          detail={detail}
          remaining={remaining}
          onReapply={() => {
            setState('form');
            setError('');
          }}
        />
      )}
    </RecoveryFrame>
  );
}
