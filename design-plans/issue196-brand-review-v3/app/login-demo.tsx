'use client';

import { useState } from 'react';
import { Button } from '@heroui/react/button';
import { Form } from '@heroui/react/form';
import { toast } from '@heroui/react/toast';
import LogoGithub from '@gravity-ui/icons/LogoGithub';
import { IdentityField } from '../../../src/components/identity/identity-field';

const demonstrate = () =>
  toast('这是交互原型，未提交数据', { variant: 'default' });
const buttonClass =
  'h-11 min-h-11 w-full rounded-lg text-sm font-normal min-[1200px]:h-9 min-[1200px]:min-h-9';

/** Mirrors LoginForm presentation; deliberately contains no authentication flow. */
export function LoginDemo() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <section
      className="grid w-full max-w-md gap-4 rounded-3xl border border-dashed border-border bg-surface px-4 py-5 shadow-sm dark:border-solid min-[1200px]:p-6"
      aria-labelledby="login-heading"
    >
      <header className="grid gap-1">
        <h1 id="login-heading" className="text-2xl leading-[1.5] font-medium">
          登录
        </h1>
        <p className="text-sm leading-[1.5]">轻装简从 · 欢迎回来</p>
      </header>
      <Form
        className="grid min-w-0 gap-3"
        validationBehavior="aria"
        onSubmit={(event) => {
          event.preventDefault();
          demonstrate();
        }}
      >
        <IdentityField
          name="email"
          label="邮箱"
          value={email}
          onChange={setEmail}
          autoComplete="username"
          icon="email"
          layout="login"
          placeholder="name@example.com"
        />
        <IdentityField
          name="password"
          label="密码"
          value={password}
          onChange={setPassword}
          secret
          autoComplete="current-password"
          icon="password"
          layout="login"
          placeholder="请输入密码"
        />
        <Button
          variant="ghost"
          className="min-h-11 w-fit justify-self-end px-3 text-sm font-normal min-[768px]:hidden"
          onPress={demonstrate}
        >
          忘记密码
        </Button>
        <Button type="submit" className={buttonClass}>
          登录
        </Button>
      </Form>
      <Button
        variant="ghost"
        className="hidden min-h-11 w-fit justify-self-center px-3 text-sm font-normal min-[768px]:flex min-[1200px]:min-h-9"
        onPress={demonstrate}
      >
        忘记密码
      </Button>
      <div className="grid gap-3">
        <div className="flex items-center gap-3 text-xs text-foreground">
          <span className="h-px flex-1 bg-border" />
          或使用第三方登录
          <span className="h-px flex-1 bg-border" />
        </div>
        <Button
          variant="outline"
          className={`${buttonClass} bg-background`}
          onPress={demonstrate}
        >
          <LogoGithub aria-hidden className="size-4 shrink-0" />
          使用 GitHub 登录
        </Button>
      </div>
    </section>
  );
}
