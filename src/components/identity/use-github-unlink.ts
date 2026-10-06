'use client';

import { useEffect, useRef, useState } from 'react';
import { AccountRequestError } from './account-request';
import {
  readGithubBinding,
  unlinkGithub,
  type GithubBinding,
} from './github-request';

export function useGithubUnlink({
  onClose,
  onUpdate,
  onUnlinked,
  onUncertain,
  onVerified,
  onSessionExpire,
}: {
  onClose: () => void;
  onUpdate: (value: GithubBinding) => void;
  onUnlinked: () => void;
  onUncertain: () => void;
  onVerified: () => void;
  onSessionExpire: () => void;
}) {
  const [phase, setPhase] = useState<
    'editing' | 'saving' | 'checking' | 'unknown'
  >('editing');
  const [feedback, setFeedback] = useState('');
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const busy = phase === 'saving' || phase === 'checking';
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function close() {
    if (!inFlight.current) onClose();
  }
  function success() {
    onUpdate(null);
    onVerified();
    onUnlinked();
    onClose();
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(
        '[data-testid="account-github-link"]:not(:disabled), [data-testid="account-github-config"]:not(:disabled)',
      );
      (target ?? document.getElementById('account-github-heading'))?.focus({
        preventScroll: true,
      });
    });
  }
  async function readCurrentBinding(reason = '') {
    setPhase('checking');
    try {
      const current = await readGithubBinding();
      if (!mounted.current) return;
      if (!current) success();
      else {
        onUpdate(current);
        onVerified();
        setPhase('editing');
        setFeedback(
          `${reason ? `${reason}。` : ''}已核对：当前 GitHub 绑定尚未解除。`,
        );
      }
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof AccountRequestError && error.status === 401)
        onSessionExpire();
      else {
        setPhase('unknown');
        setFeedback(
          error instanceof Error ? error.message : '无法核对 GitHub 绑定',
        );
      }
    }
  }
  async function check() {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await readCurrentBinding();
    } finally {
      inFlight.current = false;
    }
  }
  async function submit() {
    if (inFlight.current || phase !== 'editing') return;
    inFlight.current = true;
    setPhase('saving');
    setFeedback('');
    try {
      await unlinkGithub();
      if (mounted.current) success();
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof AccountRequestError && error.status === 401)
        onSessionExpire();
      else {
        onUncertain();
        await readCurrentBinding(
          error instanceof Error ? error.message : '无法确认解绑结果',
        );
      }
    } finally {
      inFlight.current = false;
    }
  }
  return { phase, feedback, busy, close, check, submit };
}
