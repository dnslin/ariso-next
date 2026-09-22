'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Form } from '@heroui/react/form';
import { Link } from '@heroui/react/link';
import { Spinner } from '@heroui/react/spinner';
import { accountInputSchema } from '../../server/identity/validation';
import { IdentityField } from './identity-field';
import './identity.css';

export function LoginForm({
  initialized,
  returnTo,
  notice,
}: {
  initialized: boolean;
  returnTo: string;
  notice: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState(notice);
  const [setupRequired, setSetupRequired] = useState(!initialized);
  const [busy, setBusy] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const inFlight = useRef(false);
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!retryAt) return;
    const update = () =>
      setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);

  async function submit() {
    if (inFlight.current || Date.now() < retryAt || setupRequired) return;
    const parsedEmail = accountInputSchema.shape.email.safeParse(email);
    const invalid = {
      ...(!parsedEmail.success ? { email: '请输入有效邮箱' } : {}),
      ...(!password ? { password: '请输入密码' } : {}),
    };
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      document.getElementById(Object.keys(invalid)[0])?.focus();
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      if (response.ok) {
        // Cookie 必须已经形成真实会话，不能只凭登录响应跳转。
        const session = await fetch('/api/auth/get-session', {
          cache: 'no-store',
        });
        if (!session.ok || !(await session.json())?.user)
          throw new Error('登录结果尚未确认，请重试');
        window.location.replace(returnTo);
        return;
      }
      if (response.status === 429) {
        const seconds = Number(response.headers.get('x-retry-after'));
        if (Number.isFinite(seconds) && seconds > 0) {
          setRemaining(Math.ceil(seconds));
          setRetryAt(Date.now() + seconds * 1000);
        }
        setMessage('登录请求过于频繁，请等待服务允许后重试。（HTTP 429）');
      } else {
        const body = await response.json();
        if (body.code === 'SETUP_REQUIRED') {
          setSetupRequired(true);
          setMessage('站点尚未初始化，请先完成初始化。');
        } else if (
          body.code === 'INVALID_EMAIL_OR_PASSWORD' ||
          body.code === 'INVALID_PASSWORD'
        )
          setMessage(`邮箱或密码不正确，请检查后重试。（${body.code}）`);
        else
          setMessage(
            `登录失败，请稍后重试或检查服务日志。（HTTP ${response.status} / ${body.code ?? 'UNKNOWN_ERROR'}）`,
          );
      }
    } catch (error) {
      setMessage(
        `无法确认登录结果，请检查连接后重试。${error instanceof Error ? error.message : ''}`,
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
      requestAnimationFrame(() => alertRef.current?.focus());
    }
  }

  return (
    <section
      className="identity-card identity-login"
      aria-labelledby="login-heading"
    >
      <header>
        <h1 id="login-heading">登录</h1>
        <p>轻装简从 · 欢迎回来</p>
      </header>
      {message || setupRequired ? (
        <div ref={alertRef} tabIndex={-1}>
          <Alert status="warning" role="alert">
            <Alert.Content>
              <Alert.Description>
                {message || '站点尚未初始化，请先完成初始化。'}
                {remaining > 0 ? ` ${remaining} 秒后可重试。` : ''}
              </Alert.Description>
            </Alert.Content>
          </Alert>
        </div>
      ) : null}
      {setupRequired ? (
        <Link href="/setup">开始初始化</Link>
      ) : (
        <Form
          validationBehavior="aria"
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
              setErrors((current) => ({ ...current, email: '' }));
            }}
            error={errors.email}
            autoComplete="username"
            icon="email"
          />
          <IdentityField
            name="password"
            label="密码"
            value={password}
            onChange={(value) => {
              setPassword(value);
              setErrors((current) => ({ ...current, password: '' }));
            }}
            error={errors.password}
            secret
            autoComplete="current-password"
            icon="password"
          />
          <Button type="submit" isDisabled={busy || remaining > 0}>
            {busy ? <Spinner size="sm" /> : null}
            {busy ? '正在登录…' : '登录'}
          </Button>
        </Form>
      )}
    </section>
  );
}
