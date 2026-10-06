'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { FieldError } from '@heroui/react/field-error';
import { Form } from '@heroui/react/form';
import { InputGroup } from '@heroui/react/input-group';
import { Label } from '@heroui/react/label';
import { Spinner } from '@heroui/react/spinner';
import { TextField } from '@heroui/react/textfield';
import { LockKeyhole } from 'lucide-react';
import { DetailTip } from '../library/detail-controls';

export function SharePasswordForm({
  token,
  revoked,
  onUnlocked,
  onUnavailable,
}: {
  token: string;
  revoked: boolean;
  onUnlocked: () => Promise<void>;
  onUnavailable: (status: number) => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const inFlight = useRef(false);
  const request = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!retryAt) return;
    const tick = () =>
      setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);

  async function submit() {
    if (inFlight.current || Date.now() < retryAt) return;
    if (!password || Array.from(password).length > 128) {
      setError(password ? '分享密码最多 128 个字符' : '请输入分享密码');
      input.current?.focus();
      return;
    }
    inFlight.current = true;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      let response: Response;
      let failure: { message: string } | undefined;
      try {
        response = await fetch(`/s/${encodeURIComponent(token)}/unlock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (!response.ok && ![404, 410, 429].includes(response.status))
          failure = await response.json();
      } catch (cause) {
        if (controller.signal.aborted) return;
        console.error('分享密码验证请求失败', {
          cause:
            cause instanceof Error
              ? {
                  name: cause.name,
                  message: cause.message
                    .replaceAll(token, '[Redacted]')
                    .replaceAll(password, '[Redacted]'),
                }
              : cause,
        });
        setError('连接遇到问题，无法确认验证结果，请重试。');
        return;
      }
      if (controller.signal.aborted) return;
      if (response.ok) {
        setPassword('');
        await onUnlocked();
      } else if (response.status === 404 || response.status === 410) {
        onUnavailable(response.status);
      } else if (response.status === 429) {
        const seconds = Number(response.headers.get('Retry-After'));
        if (Number.isFinite(seconds) && seconds > 0) {
          setRetryAt(Date.now() + seconds * 1000);
          setRemaining(Math.ceil(seconds));
        }
        setError('验证请求过于频繁，请稍后重试。');
      } else {
        setError(failure!.message);
      }
    } finally {
      if (!controller.signal.aborted) {
        inFlight.current = false;
        request.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <Form
      data-testid="share-password-form"
      className="grid gap-4"
      validationBehavior="aria"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <TextField
        className="gap-3"
        name="password"
        value={password}
        onChange={(value) => {
          setPassword(value);
          setError('');
        }}
        isRequired
        isInvalid={!!error && remaining === 0}
        isDisabled={busy}
      >
        <div className="flex min-h-11 items-center justify-between gap-3 [&_svg]:mx-0 [&_svg]:size-4">
          <Label className="text-sm font-medium after:content-none">
            分享密码
          </Label>
          <DetailTip label="访问说明">
            <p>
              验证成功后，此浏览器可在 24
              小时内免输密码；分享关闭、改密或到期仍会使访问失效。
            </p>
          </DetailTip>
        </div>
        <InputGroup className="h-12 min-h-12 w-full rounded-lg border bg-background shadow-none">
          <InputGroup.Prefix className="border-0 pr-2 text-foreground">
            <LockKeyhole className="size-4" aria-hidden="true" />
          </InputGroup.Prefix>
          <InputGroup.Input
            ref={input}
            data-testid="share-password-input"
            type="password"
            autoComplete="current-password"
            autoFocus={revoked}
            placeholder="请输入分享密码"
            className="h-full min-w-0 py-0 text-base leading-[1.5] placeholder:text-foreground min-[1200px]:text-sm"
          />
        </InputGroup>
        {remaining === 0 ? <FieldError>{error}</FieldError> : null}
      </TextField>
      {remaining > 0 ? (
        <Alert role="alert" className="bg-transparent p-0 shadow-none">
          <Alert.Content>
            <Alert.Description>
              {error} {remaining} 秒后可重试。
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      <Button
        data-testid="share-password-submit"
        type="submit"
        isDisabled={busy || remaining > 0}
        className="h-12 w-full rounded-lg text-sm font-normal"
      >
        {busy ? <Spinner size="sm" /> : null}
        {busy ? '正在验证…' : '验证并查看'}
      </Button>
    </Form>
  );
}
