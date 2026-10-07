'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AccountRequestError } from './account-request';
import {
  linkGithub,
  readGithubBinding,
  readGithubSettings,
  type GithubBinding,
  type GithubSettings,
} from './github-request';

const settingsKey = ['github-settings'];
const bindingKey = ['github-binding'];
const readOptions = {
  retry: false,
  networkMode: 'always' as const,
  refetchOnWindowFocus: false,
};

export function useGithubAccount(onSessionExpire: () => void) {
  const client = useQueryClient();
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState('');
  const inFlight = useRef(false);
  const redirecting = useRef(false);
  const settings = useQuery({
    queryKey: settingsKey,
    queryFn: ({ signal }) => readGithubSettings(signal),
    ...readOptions,
  });
  const binding = useQuery({
    queryKey: bindingKey,
    queryFn: ({ signal }) => readGithubBinding(signal),
    ...readOptions,
  });
  const sessionLost = [settings.error, binding.error].some(
    (error) => error instanceof AccountRequestError && error.status === 401,
  );
  const reloadSettings = settings.refetch;
  const reloadBinding = binding.refetch;

  useEffect(() => {
    function restore(event: PageTransitionEvent) {
      if (!event.persisted || !redirecting.current) return;
      redirecting.current = false;
      inFlight.current = false;
      setLinking(false);
      void reloadSettings();
      void reloadBinding();
    }
    window.addEventListener('pageshow', restore);
    return () => window.removeEventListener('pageshow', restore);
  }, [reloadSettings, reloadBinding]);

  async function link() {
    if (
      inFlight.current ||
      !settings.data?.effective.enabled ||
      settings.isFetching ||
      settings.isError ||
      !binding.isFetchedAfterMount ||
      binding.isFetching ||
      binding.isError ||
      binding.data
    )
      return;
    inFlight.current = true;
    setLinking(true);
    setLinkError('');
    try {
      const url = await linkGithub();
      redirecting.current = true;
      window.location.assign(url);
    } catch (error) {
      if (error instanceof AccountRequestError && error.status === 401)
        onSessionExpire();
      else {
        setLinkError(
          error instanceof Error ? error.message : '无法前往 GitHub 授权',
        );
        if (error instanceof AccountRequestError && error.status === 409)
          await binding.refetch();
      }
      inFlight.current = false;
      redirecting.current = false;
      setLinking(false);
    }
  }

  return {
    settings,
    binding,
    sessionLost,
    linking,
    linkError,
    link,
    onSessionExpire,
    updateSettings: (value: GithubSettings) =>
      client.setQueryData(settingsKey, value),
    updateBinding: (value: GithubBinding) =>
      client.setQueryData(bindingKey, value),
  };
}
