'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Spinner } from '@heroui/react/spinner';

/** 服务端已鉴权；浏览器会话请求负责接收续期 Cookie，并观察失效。 */
export function SessionControls({ returnTo }: { returnTo: string }) {
  const [sessionError, setSessionError] = useState('');
  const [signOutError, setSignOutError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    let disposed = false;
    let checking = false;
    const check = async () => {
      if (checking || inFlight.current || document.visibilityState === 'hidden')
        return;
      checking = true;
      try {
        const response = await fetch('/api/auth/get-session', {
          cache: 'no-store',
        });
        if (!response.ok)
          throw new Error(`会话核对失败（HTTP ${response.status}）`);
        const session = await response.json();
        if (disposed || inFlight.current) return;
        if (!session)
          window.location.replace(
            `/login?reason=expired&returnTo=${encodeURIComponent(returnTo)}`,
          );
        else setSessionError('');
      } catch (error) {
        if (!disposed && !inFlight.current)
          setSessionError(
            `${error instanceof Error ? error.message : '会话核对失败'}，请检查连接后重试。`,
          );
      } finally {
        checking = false;
      }
    };
    void check();
    const timer = setInterval(() => void check(), 60000);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [returnTo]);

  async function signOut() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setSignOutError('');
    try {
      const response = await fetch('/api/auth/sign-out', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error(`退出失败（HTTP ${response.status}）`);
      const session = await fetch('/api/auth/get-session', {
        cache: 'no-store',
      });
      if (!session.ok || (await session.json()) !== null)
        throw new Error('尚未确认会话已退出');
      window.location.replace('/login?reason=signed-out');
    } catch (error) {
      setSignOutError(
        `${error instanceof Error ? error.message : '退出失败'}，请重试。`,
      );
      inFlight.current = false;
      setBusy(false);
    }
  }
  const message = signOutError || sessionError;
  return (
    <div className="grid gap-3">
      {message ? (
        <Alert status="warning" role="alert">
          <Alert.Content>
            <Alert.Description>{message}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      <Button
        className="rounded-xl"
        variant="outline"
        isDisabled={busy}
        onPress={() => void signOut()}
      >
        {busy ? <Spinner size="sm" /> : null}
        {busy ? '正在退出…' : '退出登录'}
      </Button>
    </div>
  );
}
