'use client';

import { createElement, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from '@heroui/react/toast';
import { Check } from 'lucide-react';
import type { useGithubAccount } from './use-github-account';

function notify(message: string) {
  toast(message, {
    variant: 'default',
    indicator: createElement(Check, {
      className: 'size-5',
      'aria-hidden': true,
    }),
  });
}

export function useGithubAccountView(
  account: ReturnType<typeof useGithubAccount>,
) {
  const { settings, binding } = account;
  const [editorOpen, setEditorOpen] = useState(false);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [settingsResult, setSettingsResult] = useState<
    'known' | 'unknown' | 'verified'
  >('known');
  const [unlinkUnknown, setUnlinkUnknown] = useState(false);
  const settingsUnknown = settingsResult === 'unknown';
  const parameters = useSearchParams();
  const notified = useRef(false);
  const pendingSettingsFocus = useRef(false);
  const settingsLoading = !settings.isFetchedAfterMount || settings.isFetching;
  const bindingLoading = !binding.isFetchedAfterMount || binding.isFetching;
  const settingsReady =
    !settingsUnknown &&
    !settingsLoading &&
    !settings.isError &&
    !!settings.data;
  const bindingReady = !unlinkUnknown && !bindingLoading && !binding.isError;
  const bound = binding.data ?? null;
  const canLink =
    settingsReady &&
    !!settings.data?.effective.enabled &&
    bindingReady &&
    !bound;

  useEffect(() => {
    if (!pendingSettingsFocus.current || !settingsReady) return;
    pendingSettingsFocus.current = false;
    document
      .querySelector<HTMLElement>('[data-testid="account-github-config"]')
      ?.focus({ preventScroll: true });
  }, [settingsReady, settingsResult]);

  useEffect(() => {
    if (
      parameters.get('github') !== 'linked' ||
      !bindingReady ||
      !binding.data ||
      notified.current
    )
      return;
    notified.current = true;
    notify('GitHub 已绑定');
    const url = new URL(window.location.href);
    url.searchParams.delete('github');
    window.history.replaceState(
      null,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [parameters, bindingReady, binding.data]);

  function closeEditor() {
    setEditorOpen(false);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          settingsUnknown
            ? '[data-testid="oauth-settings-reload"]'
            : '[data-testid="account-github-config"]',
        )
        ?.focus({ preventScroll: true }),
    );
  }
  function closeUnlink() {
    setUnlinkOpen(false);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          unlinkUnknown
            ? '[data-testid="account-github-reload"]'
            : '[data-testid="account-github-unlink"]',
        )
        ?.focus({ preventScroll: true }),
    );
  }
  async function checkSettings() {
    if (settings.isFetching) return;
    const current = await settings.refetch();
    if (current.isError) return;
    pendingSettingsFocus.current = true;
    setSettingsResult('verified');
    notify('已核对当前配置');
  }
  async function checkBinding() {
    if (binding.isFetching) return;
    const current = await binding.refetch();
    if (current.isError) return;
    setUnlinkUnknown(false);
    notify(current.data ? '已核对：当前账号仍已绑定' : '已核对：尚未绑定');
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(
        '[data-testid="account-github-unlink"]:not(:disabled), [data-testid="account-github-link"]:not(:disabled), [data-testid="account-github-config"]:not(:disabled)',
      );
      (target ?? document.getElementById('account-github-heading'))?.focus({
        preventScroll: true,
      });
    });
  }

  return {
    settings,
    binding,
    bindingLoading,
    settingsReady,
    bindingReady,
    bound,
    canLink,
    settingsUnknown,
    unlinkUnknown,
    settingsResult,
    editorOpen,
    unlinkOpen,
    callbackFailed: parameters.get('github') === 'error',
    openEditor: () => setEditorOpen(true),
    openUnlink: () => setUnlinkOpen(true),
    closeEditor,
    closeUnlink,
    checkSettings,
    checkBinding,
    settingsUncertain: () => setSettingsResult('unknown'),
    settingsVerified: () => setSettingsResult('verified'),
    unlinkUncertain: () => setUnlinkUnknown(true),
    unlinkVerified: () => setUnlinkUnknown(false),
    saved: () => {
      setSettingsResult('known');
      notify('配置已保存');
    },
    unlinked: () => notify('GitHub 已解绑'),
  };
}
