import { useState } from 'react';
import { Button } from '@heroui/react/button';
import {
  RecoveryFrame,
  recoveryActionClass,
} from '../../../src/components/identity/recovery-frame';
import { usePrototype } from './shared';

export function ResetDemo() {
  const { mode } = usePrototype();
  const [screen, setScreen] = useState<
    'unknown' | 'reapply' | 'accepted' | 'login'
  >('unknown');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  return (
    <main className="grid min-h-dvh content-start justify-items-center bg-background px-4 pb-8 pt-[130px] text-foreground min-[768px]:pt-[170px]">
      <section className="grid w-full max-w-[480px] gap-4 rounded-3xl border border-dashed border-border bg-surface px-6 py-7 text-sm leading-[1.5] dark:border-solid min-[768px]:px-8">
        {screen === 'unknown' ? (
          <>
            <h1 className="text-2xl font-medium">
              {mode === 'before' ? '重置未完成' : '重置结果待确认'}
            </h1>
            <p role="alert" className="min-h-[30px] text-sm text-muted">
              {mode === 'before'
                ? '本次重置未完成，密码可能已更新，旧会话也可能仍有效。请重新申请链接，再设置一次密码。'
                : '未收到明确结果，密码可能已更新。请重新申请链接，再设置一次密码。'}
            </p>
            <Button
              className={`${recoveryActionClass} bg-accent text-accent-foreground`}
              onPress={() => setScreen('reapply')}
            >
              重新申请链接
            </Button>
            <Button
              variant="outline"
              className={recoveryActionClass}
              onPress={() => setScreen('login')}
            >
              返回登录
            </Button>
          </>
        ) : screen === 'reapply' ? (
          <>
            <h1 className="text-2xl font-medium">找回密码</h1>
            <p className="text-muted">输入登录邮箱，接收新的重置密码邮件。</p>
            <label className="grid gap-2">
              邮箱
              <input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError('');
                }}
                className="h-12 rounded-lg border border-border bg-background px-3"
              />
            </label>
            {error ? (
              <p role="alert" className="text-danger">
                {error}
              </p>
            ) : null}
            <Button
              className={recoveryActionClass}
              onPress={() => {
                if (!email.includes('@')) setError('请输入有效邮箱地址');
                else setScreen('accepted');
              }}
            >
              发送重置邮件（演示）
            </Button>
            <Button
              variant="ghost"
              className={recoveryActionClass}
              onPress={() => setScreen('unknown')}
            >
              返回结果页
            </Button>
          </>
        ) : screen === 'accepted' ? (
          <>
            <h1 className="text-2xl font-medium">已接受请求</h1>
            <p role="status" className="text-muted">
              如果该邮箱对应账号，重置邮件会发送到该邮箱。请检查收件箱。
            </p>
            <Button
              variant="outline"
              className={recoveryActionClass}
              onPress={() => setScreen('login')}
            >
              返回登录
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-medium">登录</h1>
            <p className="text-muted">
              请使用当前有效的密码登录。无法登录时重新申请重置链接。
            </p>
            <Button
              variant="outline"
              className={recoveryActionClass}
              onPress={() => setScreen('unknown')}
            >
              返回结果页
            </Button>
          </>
        )}
      </section>
    </main>
  );
}

export function RecoveryDemo() {
  const { mode } = usePrototype();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [screen, setScreen] = useState<'form' | 'accepted' | 'login'>('form');
  if (screen === 'login')
    return (
      <main className="grid min-h-dvh content-center justify-items-center gap-4 bg-background px-4">
        <h1 className="text-2xl font-medium">登录</h1>
        <Button
          variant="outline"
          className={recoveryActionClass}
          onPress={() => setScreen('form')}
        >
          返回找回密码
        </Button>
      </main>
    );
  return (
    <div
      className={mode === 'after' ? 'p2-recovery-after' : 'p2-recovery-before'}
    >
      <RecoveryFrame
        state={screen}
        title={screen === 'form' ? '找回密码' : '已接受请求'}
      >
        {screen === 'form' ? (
          <>
            <p>
              {error
                ? '请输入用于登录的邮箱。'
                : '输入登录邮箱，接收密码重置邮件。'}
            </p>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!email.includes('@')) {
                  setError('请输入有效邮箱地址');
                  return;
                }
                setError('');
                setScreen('accepted');
              }}
            >
              <label className="grid gap-2">
                邮箱
                <input
                  type="email"
                  autoComplete="username"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError('');
                  }}
                  className="h-12 rounded-lg border border-border bg-background px-3 text-sm"
                />
              </label>
              {error ? (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              ) : null}
              <Button
                type="submit"
                className="h-11 min-h-11 w-full rounded-lg text-sm font-normal min-[1200px]:h-9 min-[1200px]:min-h-9"
              >
                发送重置邮件
              </Button>
            </form>
            <Button
              variant="ghost"
              className="flex min-h-11 w-full items-center justify-center rounded-lg text-sm font-normal min-[1200px]:min-h-9"
              onPress={() => setScreen('login')}
            >
              想起密码了？返回登录
            </Button>
          </>
        ) : (
          <>
            <p role="status">
              如果该邮箱对应账号，重置邮件会发送到该邮箱。请检查收件箱。
            </p>
            <Button
              variant="outline"
              className={recoveryActionClass}
              onPress={() => setScreen('form')}
            >
              重新填写邮箱
            </Button>
            <Button
              variant="ghost"
              className={recoveryActionClass}
              onPress={() => setScreen('login')}
            >
              返回登录
            </Button>
          </>
        )}
      </RecoveryFrame>
    </div>
  );
}
