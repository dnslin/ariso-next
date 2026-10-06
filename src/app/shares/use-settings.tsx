'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@heroui/react/toast';
import { CircleCheck } from 'lucide-react';
import { passwordInputSchema } from '../../server/sharing/validation';
import { shareRequest, ShareRequestError, shareUrl, type Share } from './api';
import {
  displayPatch,
  expiryDraft,
  expiryChanged,
  expiryPayload,
  reconcileResult,
  type PendingResult,
} from './model';

export type Action =
  | 'create'
  | 'disable'
  | 'enable'
  | 'enable-expired'
  | 'rotate'
  | 'clear'
  | 'manual'
  | 'discard';
type Feedback = {
  title: string;
  detail?: string;
  checking?: boolean;
  retry?: boolean;
};
type ErrorTarget =
  | 'password'
  | 'expiry'
  | 'display'
  | 'dialog'
  | 'dialogPassword'
  | 'dialogExpiry';

export function useSettings(
  initialShare: Share | null,
  albumId: string,
  timeZone: string,
  onExpire: () => void,
  onReturn: () => void,
) {
  const [share, setShare] = useState(initialShare);
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [expiry, setExpiry] = useState(() =>
    expiryDraft(initialShare?.expiresAt ?? null, timeZone),
  );
  const [restoreExpiry, setRestoreExpiry] = useState(() =>
    expiryDraft(null, timeZone),
  );
  const [layout, setLayout] = useState<Share['layout']>(
    initialShare?.layout ?? 'grid',
  );
  const [showName, setShowName] = useState(initialShare?.showName ?? false);
  const [modal, setModal] = useState<Action | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [errors, setErrors] = useState<Partial<Record<ErrorTarget, string>>>(
    {},
  );
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingResult | null>(null);
  const [missing, setMissing] = useState(false);
  const [now, setNow] = useState(Date.now);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const noticeId = useRef<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const manualRef = useRef<HTMLTextAreaElement | null>(null);
  const address = share?.url ?? '';
  const expired = Boolean(
    share?.expiresAt && new Date(share.expiresAt).getTime() <= now,
  );
  const enabled = share?.enabled ?? false;
  const hasPassword = share?.hasPassword ?? false;
  const blocked = busy || Boolean(pending) || missing;
  const copyBlocked =
    missing || pending?.kind === 'rotate' || (busy && modal === 'rotate');
  const displayDirty = Boolean(
    share && (layout !== share.layout || showName !== share.showName),
  );
  const expiryDirty = Boolean(
    share && expiryChanged(expiry, share.expiresAt, timeZone),
  );
  const dirty = displayDirty || expiryDirty || Boolean(password);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      if (noticeId.current) toast.close(noticeId.current);
    };
  }, []);
  useEffect(() => {
    if (!share?.expiresAt) return;
    const remaining = new Date(share.expiresAt).getTime() - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(remaining + 1, 2147483647),
    );
    return () => clearTimeout(timer);
  }, [share?.expiresAt, now]);
  useEffect(() => {
    if (feedback && !modalOpen)
      feedbackRef.current?.focus({ preventScroll: true });
  }, [feedback, modalOpen]);
  const restoreFocus = useCallback(() => {
    if (!mounted.current) return;
    const target = feedbackRef.current?.isConnected
      ? feedbackRef.current
      : opener.current?.isConnected && !opener.current.matches(':disabled')
        ? opener.current
        : headingRef.current;
    target?.focus({ preventScroll: true });
  }, []);
  const dialogRef = useCallback(
    (node: HTMLElement | null) => {
      if (!node) requestAnimationFrame(restoreFocus);
    },
    [restoreFocus],
  );

  function open(action: Action, source?: HTMLElement | null) {
    if (blocked && action !== 'manual' && action !== 'discard') return;
    clearNotice();
    opener.current = source ?? (document.activeElement as HTMLElement);
    setErrors({});
    if (action === 'enable-expired')
      setRestoreExpiry(expiryDraft(null, timeZone));
    setModal(action);
    setModalOpen(true);
  }
  function close() {
    if (!inFlight.current) {
      setModalOpen(false);
      setErrors({});
    }
  }
  function accept(next: Share | null, operation?: PendingResult) {
    if (next) {
      // Preserve another group's unsaved changes when the server returns its complete record.
      if (!share || layout === share.layout || operation?.kind === 'create')
        setLayout(next.layout);
      if (!share || showName === share.showName || operation?.kind === 'create')
        setShowName(next.showName);
      if (!share || !expiryDirty || operation?.kind === 'create')
        setExpiry(expiryDraft(next.expiresAt, timeZone));
    }
    setShare(next);
    setNow(Date.now());
  }
  function finishConfirmed(next: Share, operation: PendingResult) {
    accept(next, operation);
    if (
      operation.kind === 'password' ||
      operation.kind === 'create' ||
      (operation.kind === 'patch' && 'hasPassword' in operation.expected)
    )
      setPassword('');
    if (operation.kind === 'patch' && 'expiresAt' in operation.expected)
      setExpiry(expiryDraft(next.expiresAt, timeZone));
    if (operation.kind === 'patch' && 'layout' in operation.expected)
      setLayout(next.layout);
    if (operation.kind === 'patch' && 'showName' in operation.expected)
      setShowName(next.showName);
  }
  function clearNotice() {
    if (noticeId.current) toast.close(noticeId.current);
    noticeId.current = null;
  }
  function notice(title: string) {
    clearNotice();
    noticeId.current = toast(title, {
      indicator: <CircleCheck size={18} aria-hidden />,
      variant: 'default',
    });
  }
  function terminalError(error: unknown) {
    if (error instanceof ShareRequestError && error.status === 401) {
      onExpire();
      return true;
    }
    if (error instanceof ShareRequestError && error.status === 404) {
      setMissing(true);
      setModalOpen(false);
      setFeedback({
        title: '相册或分享已不存在',
        detail: '请返回后重新选择相册。',
      });
      return true;
    }
    return false;
  }
  async function readResult(operation = pending) {
    if (!operation || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    controller.current = new AbortController();
    setFeedback({ title: '正在核对当前设置…', checking: true });
    try {
      const result = await shareRequest<{ share: Share | null }>(
        shareUrl(albumId),
        { signal: controller.current.signal },
      );
      if (!mounted.current) return;
      const outcome = reconcileResult(operation, result.share);
      if (result.share && outcome.confirmed) {
        finishConfirmed(result.share, operation);
        setPending(null);
        setFeedback(null);
        notice(outcome.title);
        requestAnimationFrame(restoreFocus);
      } else {
        accept(result.share, operation);
        setFeedback({
          title: outcome.title,
          detail:
            operation.kind === 'password'
              ? '接口不会返回密码内容。请核实后再决定是否重新设置。'
              : '可重新读取。结束核对后，可明确发起新的操作。',
          retry: true,
        });
      }
    } catch (error) {
      if (!mounted.current || controller.current.signal.aborted) return;
      if (!terminalError(error))
        setFeedback({
          title: '读取失败，结果尚未确认',
          detail:
            error instanceof Error ? error.message : '请检查连接后重新核对。',
          retry: true,
        });
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function save(
    body: Record<string, unknown>,
    message: string,
    operation: PendingResult,
    target: ErrorTarget,
    method = 'PATCH',
  ) {
    if (inFlight.current || pending || missing) return;
    inFlight.current = true;
    setBusy(true);
    setErrors({});
    setFeedback(null);
    controller.current = new AbortController();
    try {
      const result = await shareRequest<{ share: Share }>(
        `${shareUrl(albumId)}${operation.kind === 'rotate' ? '/rotate' : ''}`,
        {
          method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.current.signal,
        },
      );
      if (!mounted.current) return;
      finishConfirmed(result.share, operation);
      setModalOpen(false);
      notice(operation.kind === 'create' ? '已读取分享设置' : message);
    } catch (error) {
      if (!mounted.current || controller.current.signal.aborted) return;
      if (terminalError(error)) return;
      if (
        error instanceof ShareRequestError &&
        error.status >= 400 &&
        error.status < 500
      )
        setErrors({ [target]: error.message });
      else {
        setPending(operation);
        setModalOpen(false);
        // A lost write response is not a failed write. Only read back; never resend.
        inFlight.current = false;
        await readResult(operation);
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function savePassword() {
    if (!passwordInputSchema.safeParse(password).success) {
      setErrors({ password: '密码需为 1–128 个字符。' });
      return;
    }
    void save(
      { password: { action: 'set', value: password } },
      '访问密码已保存',
      { kind: 'password' },
      'password',
    );
  }
  function saveExpiry(restore = false) {
    try {
      const expiresAt = expiryPayload(
        restore ? restoreExpiry : expiry,
        timeZone,
      );
      const body = { expiresAt, ...(restore ? { enabled: true } : {}) };
      void save(
        body,
        restore ? '分享已启用' : '有效期已保存',
        { kind: 'patch', expected: body },
        restore ? 'dialog' : 'expiry',
      );
    } catch (error) {
      setErrors({
        [restore ? 'dialogExpiry' : 'expiry']: (error as Error).message,
      });
    }
  }
  function saveDisplay() {
    if (!share) return;
    const body = displayPatch(share, layout, showName);
    if (Object.keys(body).length)
      void save(
        body,
        '访客展示已保存',
        { kind: 'patch', expected: body },
        'display',
      );
  }
  async function copy() {
    if (copyBlocked || (inFlight.current && modal === 'rotate')) return;
    try {
      await navigator.clipboard.writeText(address);
      if (mounted.current) notice('分享地址已复制');
    } catch {
      if (mounted.current) open('manual');
    }
  }
  function confirm() {
    if (modal === 'manual') return close();
    if (modal === 'discard') {
      setModalOpen(false);
      onReturn();
      return;
    }
    if (modal === 'enable-expired') return saveExpiry(true);
    if (modal === 'create') {
      if (password && !passwordInputSchema.safeParse(password).success) {
        setErrors({ dialogPassword: '密码需为 1–128 个字符。' });
        return;
      }
      try {
        void save(
          {
            ...(password
              ? { password: { action: 'set', value: password } }
              : {}),
            expiresAt: expiryPayload(expiry, timeZone),
          },
          '已读取分享设置',
          { kind: 'create' },
          'dialog',
          'POST',
        );
      } catch (error) {
        setErrors({ dialogExpiry: (error as Error).message });
      }
    } else if (modal === 'clear')
      void save(
        { password: { action: 'clear' } },
        '访问密码已清除',
        { kind: 'patch', expected: { hasPassword: false } },
        'dialog',
      );
    else if (modal === 'rotate' && share)
      void save(
        {},
        '分享地址已重新生成',
        { kind: 'rotate', previousToken: share.token },
        'dialog',
        'POST',
      );
    else if (modal === 'enable' || modal === 'disable') {
      if (
        modal === 'enable' &&
        share?.expiresAt &&
        new Date(share.expiresAt).getTime() <= Date.now()
      ) {
        setRestoreExpiry(expiryDraft(null, timeZone));
        setModal('enable-expired');
        return;
      }
      const body = { enabled: modal === 'enable' };
      void save(
        body,
        body.enabled ? '分享已启用' : '分享已停用',
        { kind: 'patch', expected: body },
        'dialog',
      );
    }
  }
  function returnPage() {
    if (dirty) open('discard');
    else onReturn();
  }
  function endChecking() {
    if (inFlight.current || pending?.kind === 'rotate') return;
    setPending(null);
    setFeedback(null);
    requestAnimationFrame(restoreFocus);
  }
  return {
    share,
    password,
    setPassword,
    passwordVisible,
    setPasswordVisible,
    expiry,
    setExpiry,
    restoreExpiry,
    setRestoreExpiry,
    layout,
    setLayout,
    showName,
    setShowName,
    modal,
    modalOpen,
    feedback,
    feedbackRef,
    headingRef,
    manualRef,
    dialogRef,
    errors,
    busy,
    blocked,
    copyBlocked,
    canEndChecking: pending?.kind !== 'rotate',
    missing,
    address,
    expired,
    enabled,
    hasPassword,
    dirty: displayDirty,
    open,
    close,
    confirm,
    copy,
    savePassword,
    saveExpiry,
    saveDisplay,
    readResult,
    endChecking,
    returnPage,
  };
}
