'use client';

import { useCallback, useEffect, useState } from 'react';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { CloseButton } from '@heroui/react/close-button';
import { Modal } from '@heroui/react/modal';
import { Spinner } from '@heroui/react/spinner';
import { DetailReadError, detailQueryOptions } from '../library/read-detail';
import { ImageShareBody } from './image-share-body';

/** Management opens the same body after reading the real owner-only image detail. */
export function ImageShareDialog({
  imageId,
  displayName,
  onClose,
  onSessionExpire,
  onChanged,
}: {
  imageId: string;
  displayName: string;
  onClose: () => void;
  onSessionExpire?: () => void;
  onChanged?: () => void;
}) {
  const [client] = useState(() => new QueryClient());
  const query = useQuery(
    {
      ...detailQueryOptions(imageId),
      staleTime: 0,
      refetchOnWindowFocus: true,
    },
    client,
  );
  const expire = useCallback(() => {
    if (onSessionExpire) onSessionExpire();
    else
      window.location.replace(
        '/login?reason=expired&returnTo=' +
          encodeURIComponent(window.location.pathname + window.location.search),
      );
  }, [onSessionExpire]);
  useEffect(() => () => client.clear(), [client]);
  useEffect(() => {
    if (query.error instanceof DetailReadError && query.error.status === 401)
      expire();
  }, [query.error, expire]);
  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Container
        placement="center"
        scroll="inside"
        className="w-full p-0 md:p-6"
      >
        <Modal.Dialog
          aria-label="私有图片临时分享"
          className="h-(--visual-viewport-height) max-h-full min-h-0 w-full max-w-none gap-4 rounded-none bg-background p-4 pt-[max(16px,env(safe-area-inset-top))] md:h-auto md:max-h-[calc(var(--visual-viewport-height)-48px)] md:max-w-300 md:rounded-3xl md:p-6"
        >
          <Modal.Header className="flex shrink-0 flex-row items-center justify-between gap-3">
            <Modal.Heading className="text-lg">临时分享</Modal.Heading>
            <CloseButton
              aria-label="关闭临时分享"
              className="size-11 shrink-0 rounded-lg border border-border"
              onPress={onClose}
            />
          </Modal.Header>
          {query.isPending ? (
            <Modal.Body>
              <p role="status" className="flex items-center gap-2 py-6 text-sm">
                <Spinner size="sm" />
                正在读取图片详情：{displayName}
              </p>
            </Modal.Body>
          ) : null}
          {query.isError ? (
            <Modal.Body>
              <Alert status="danger">
                <Alert.Content>
                  <Alert.Title>图片详情读取失败</Alert.Title>
                  <Alert.Description>{query.error.message}</Alert.Description>
                  <Button
                    variant="outline"
                    className="mt-3 min-h-11 rounded-lg"
                    isDisabled={query.isFetching}
                    onPress={() => {
                      void query.refetch();
                    }}
                  >
                    重试读取图片
                  </Button>
                </Alert.Content>
              </Alert>
            </Modal.Body>
          ) : null}
          {query.data && !query.isError ? (
            <ImageShareBody
              key={query.data.id}
              detail={query.data}
              onSessionExpire={expire}
              onChanged={onChanged}
            />
          ) : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
