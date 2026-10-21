'use client';

import { useEffect, useRef, useState } from 'react';
import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import type {
  ImageSizeInput,
  SizePreset,
  SizeVersion,
} from '../../server/media/size-types';
import { requestSizeState, SizeRequestError } from './size-request';

export function useImageSizeLinks(
  imageId: string,
  version: SizeVersion | null,
  preset: SizePreset | 'native',
  sourceContentId: string | null,
  enabled: boolean,
  onExpire: () => void,
) {
  const [client] = useState(() => new QueryClient());
  const controller = useRef<AbortController | null>(null);
  const identity = JSON.stringify([imageId, version, preset, sourceContentId]);
  const key = ['image-size', identity] as const;
  const active = enabled && version !== null && preset !== 'native';
  const query = useQuery(
    {
      queryKey: key,
      queryFn: ({ signal }) =>
        requestSizeState(
          imageId,
          { version: version!, preset: preset as SizePreset },
          'GET',
          signal,
        ),
      enabled: active,
      retry: false,
      refetchInterval: (query) =>
        !query.state.error &&
        query.state.data &&
        ['queued', 'running'].includes(query.state.data.status)
          ? 750
          : false,
      refetchOnWindowFocus: true,
    },
    client,
  );
  const generation = useMutation(
    {
      mutationFn: (value: {
        imageId: string;
        input: ImageSizeInput;
        identity: string;
      }) => {
        controller.current?.abort();
        const pending = new AbortController();
        controller.current = pending;
        return requestSizeState(
          value.imageId,
          value.input,
          'POST',
          pending.signal,
        );
      },
      onSuccess: (result, value) =>
        client.setQueryData(['image-size', value.identity], result),
    },
    client,
  );
  useEffect(() => () => controller.current?.abort(), [identity]);
  useEffect(() => () => client.clear(), [client]);
  const generationError =
    generation.variables?.identity === identity ? generation.error : null;
  const error = query.error ?? generationError;
  const generating =
    active &&
    ((generation.isPending && generation.variables?.identity === identity) ||
      (!error &&
        (query.data?.status === 'queued' || query.data?.status === 'running')));
  useEffect(() => {
    if (error instanceof SizeRequestError && error.status === 401) onExpire();
  }, [error, onExpire]);
  return {
    result: active ? (query.data ?? null) : null,
    error: active && error ? error.message : null,
    generating,
    pending:
      active &&
      (generating ||
        query.isPending ||
        query.isFetching ||
        (generation.isPending && generation.variables?.identity === identity)),
    generate: async () => {
      if (!active) return;
      await client.cancelQueries({ queryKey: key });
      generation.mutate({ imageId, input: { version, preset }, identity });
    },
    retry: () => {
      generation.reset();
      void query.refetch();
    },
  };
}
export type ImageSizeLinks = ReturnType<typeof useImageSizeLinks>;
