'use client';

import { useEffect, useRef, useState } from 'react';
import {
  accountEmailInputSchema,
  accountPasswordInputSchema,
} from '../../server/identity/validation';
import { useResetUpload } from '../upload/provider';
import {
  accountRequest,
  AccountRequestError,
  readAccountEmail,
} from './account-request';

export type AccountEditorProps = {
  kind: 'email' | 'password';
  email: string;
  onClose: () => void;
  onEmailChange: (email: string) => void;
  onSuccess: (kind: 'email' | 'password') => void;
  onSessionExpire: () => void;
};

type Phase =
  'editing' | 'saving' | 'unknown' | 'checking' | 'verified' | 'signing-out';

export function useAccountEditor({
  kind,
  email,
  onClose,
  onEmailChange,
  onSuccess,
  onSessionExpire,
}: AccountEditorProps) {
  const [values, setValues] = useState({
    email,
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState('');
  const [phase, setPhase] = useState<Phase>('editing');
  const [currentEmail, setCurrentEmail] = useState('');
  const [focusTarget, setFocusTarget] = useState<{ field: string } | null>(
    null,
  );
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const resetUpload = useResetUpload();
  const busy = ['saving', 'checking', 'signing-out'].includes(phase);

  useEffect(() => {
    mounted.current = true;
    const frame = requestAnimationFrame(() =>
      document
        .getElementById(kind === 'email' ? 'email' : 'currentPassword')
        ?.focus(),
    );
    return () => {
      mounted.current = false;
      cancelAnimationFrame(frame);
      // 写入请求继续完成；卸载只停止更新这个弹窗。
    };
  }, [kind]);

  useEffect(() => {
    if (focusTarget && !busy)
      document.getElementById(focusTarget.field)?.focus();
  }, [focusTarget, busy]);

  function change(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
  }

  function close() {
    if (!inFlight.current) onClose();
  }

  async function readCurrentEmail() {
    setPhase('checking');
    setFeedback('');
    try {
      const result = await readAccountEmail();
      if (!mounted.current) return;
      setCurrentEmail(result);
      setPhase('verified');
      onEmailChange(result);
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof AccountRequestError && error.status === 401) {
        onSessionExpire();
        return;
      }
      setPhase('unknown');
      setFeedback(error instanceof Error ? error.message : '无法核对当前邮箱');
    }
  }

  async function checkEmail() {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await readCurrentEmail();
    } finally {
      inFlight.current = false;
    }
  }

  async function submit() {
    if (inFlight.current || phase !== 'editing') return;
    const parsed =
      kind === 'email'
        ? accountEmailInputSchema.safeParse(values)
        : accountPasswordInputSchema.safeParse(values);
    if (!parsed.success) {
      const invalid: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        invalid[String(issue.path[0])] ??= issue.message;
      setErrors(invalid);
      setFocusTarget({ field: Object.keys(invalid)[0] });
      return;
    }
    inFlight.current = true;
    setPhase('saving');
    setErrors({});
    setFeedback('');
    try {
      const result = await accountRequest<{ code?: unknown; email?: unknown }>(
        `/api/account/${kind}`,
        {
          method: kind === 'email' ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.data),
        },
      );
      if (
        !result ||
        result.code !==
          (kind === 'email'
            ? 'ACCOUNT_EMAIL_UPDATED'
            : 'ACCOUNT_PASSWORD_UPDATED') ||
        (kind === 'email' && typeof result.email !== 'string')
      )
        throw new Error('无法确认账号修改响应');
      if (!mounted.current) return;
      if (kind === 'email' && typeof result.email === 'string')
        onEmailChange(result.email);
      onSuccess(kind);
      onClose();
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof AccountRequestError && error.status < 500) {
        if (error.status === 401) {
          onSessionExpire();
          return;
        }
        const invalid = Object.fromEntries(
          error.fields.map(({ field, message }) => [field, message]),
        );
        if (error.status === 409) {
          setValues((current) => ({ ...current, currentPassword: '' }));
          invalid.currentPassword = '密码已变更，请重新输入当前密码';
        }
        setErrors(invalid);
        setFeedback(error.message);
        setFocusTarget({
          field:
            Object.keys(invalid)[0] ??
            (kind === 'email' ? 'email' : 'currentPassword'),
        });
        setPhase('editing');
      } else {
        setPhase('unknown');
        setFeedback(
          error instanceof Error ? error.message : '无法确认修改结果',
        );
        if (kind === 'email') await readCurrentEmail();
      }
    } finally {
      inFlight.current = false;
    }
  }

  async function signOutToCheck() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase('signing-out');
    setFeedback('');
    try {
      const result = await accountRequest<{ success?: unknown }>(
        '/api/auth/sign-out',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      );
      if (!result || result.success !== true)
        throw new Error('尚未确认会话已退出');
      if (!mounted.current) return;
      resetUpload();
      window.location.replace(
        '/login?reason=signed-out&returnTo=%2Fsettings%2Faccount',
      );
    } catch (error) {
      if (!mounted.current) return;
      setPhase('unknown');
      setFeedback(
        `${error instanceof Error ? error.message : '退出失败'}，请重试。`,
      );
      inFlight.current = false;
    }
  }

  return {
    values,
    errors,
    feedback,
    phase,
    currentEmail,
    busy,
    change,
    close,
    submit,
    checkEmail,
    signOutToCheck,
  };
}
