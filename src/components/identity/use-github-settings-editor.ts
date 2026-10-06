'use client';

import { useEffect, useRef, useState } from 'react';
import { AccountRequestError } from './account-request';
import {
  readGithubSettings,
  saveGithubSettings,
  type GithubSettings,
} from './github-request';
import {
  githubSettingsDraftErrors,
  githubSettingsDraftInput,
  type GithubSettingsDraft,
} from './github-settings-draft';

export type GithubSettingsEditorProps = {
  settings: GithubSettings;
  onClose: () => void;
  onUpdate: (value: GithubSettings) => void;
  onSaved: () => void;
  onUncertain: () => void;
  onVerified: () => void;
  onSessionExpire: () => void;
};

export function useGithubSettingsEditor(props: GithubSettingsEditorProps) {
  const [draft, setDraft] = useState<GithubSettingsDraft>({
    enabled: props.settings.saved.enabled,
    clientId: props.settings.saved.clientId,
    clientSecret: '',
    clearSecret: false,
  });
  const [phase, setPhase] = useState<
    'editing' | 'saving' | 'checking' | 'unknown' | 'verified'
  >('editing');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState('');
  const [verified, setVerified] = useState<GithubSettings | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ field: string } | null>(
    null,
  );
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const busy = phase === 'saving' || phase === 'checking';

  useEffect(() => {
    mounted.current = true;
    const frame = requestAnimationFrame(() =>
      document.getElementById('oauth-client-id')?.focus(),
    );
    return () => {
      mounted.current = false;
      cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    if (focusTarget && !busy)
      document
        .getElementById(
          `oauth-${focusTarget.field === 'clientId' ? 'client-id' : 'client-secret'}`,
        )
        ?.focus();
  }, [focusTarget, busy]);

  function change(
    field: 'enabled' | 'clientId' | 'clientSecret',
    value: string | boolean,
  ) {
    if (phase !== 'editing') return;
    setDraft((current) => ({
      ...current,
      [field]: value,
      ...(field === 'clientSecret' && value !== ''
        ? { clearSecret: false }
        : {}),
    }));
    setErrors((current) => ({ ...current, [field]: '' }));
  }
  function clearSecret() {
    setDraft((current) => ({
      ...current,
      enabled: false,
      clientSecret: '',
      clearSecret: true,
    }));
    setErrors({});
  }
  function close() {
    if (!inFlight.current) props.onClose();
  }

  async function readCurrentSettings() {
    setPhase('checking');
    try {
      const current = await readGithubSettings();
      if (!mounted.current) return;
      props.onUpdate(current);
      props.onVerified();
      setVerified(current);
      setPhase('verified');
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof AccountRequestError && error.status === 401)
        props.onSessionExpire();
      else {
        setFeedback(
          error instanceof Error ? error.message : '无法核对当前配置',
        );
        setPhase('unknown');
      }
    }
  }
  async function check() {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await readCurrentSettings();
    } finally {
      inFlight.current = false;
    }
  }
  async function submit() {
    if (inFlight.current || phase !== 'editing') return;
    const invalid = githubSettingsDraftErrors(
      draft,
      props.settings.saved.hasSecret,
    );
    if (Object.keys(invalid).length) {
      setErrors(invalid);
      setFocusTarget({ field: Object.keys(invalid)[0] });
      return;
    }
    inFlight.current = true;
    setPhase('saving');
    setFeedback('');
    setErrors({});
    try {
      const result = await saveGithubSettings(githubSettingsDraftInput(draft));
      if (!mounted.current) return;
      props.onUpdate(result);
      props.onSaved();
      props.onClose();
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof AccountRequestError && error.status === 401)
        props.onSessionExpire();
      else if (error instanceof AccountRequestError && error.status < 500) {
        const invalid = Object.fromEntries(
          error.fields.map(({ field, message }) => [field, message]),
        );
        setErrors(invalid);
        setFeedback(error.message);
        setPhase('editing');
        setFocusTarget({ field: Object.keys(invalid)[0] ?? 'clientId' });
      } else {
        props.onUncertain();
        setFeedback(
          error instanceof Error ? error.message : '无法确认配置保存结果',
        );
        await readCurrentSettings();
      }
    } finally {
      inFlight.current = false;
    }
  }
  return {
    draft,
    errors,
    feedback,
    phase,
    verified,
    busy,
    change,
    clearSecret,
    close,
    submit,
    check,
  };
}
