'use client';

import { useRef, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertDialog } from '@heroui/react/alert-dialog';
import { Button } from '@heroui/react/button';

export function useStorageLeaveConfirmation({
  dirty,
  unknown,
  busy,
}: {
  dirty: boolean;
  unknown: boolean;
  busy: boolean;
}) {
  const router = useRouter();
  const [destination, setDestination] = useState<string | null>(null);
  const returnOpener = useRef<HTMLElement | null>(null);

  function navigate(
    href: string,
    opener = document.activeElement as HTMLElement,
  ) {
    if (busy) return;
    if (dirty || unknown) {
      returnOpener.current = opener;
      setDestination(href);
    } else router.push(href);
  }

  function navigateFromReference(event: MouseEvent<Element>, href: string) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (event.currentTarget.getAttribute('target') &&
        event.currentTarget.getAttribute('target') !== '_self')
    )
      return;
    if (!dirty && !unknown && !busy) return;
    event.preventDefault();
    navigate(href, event.currentTarget as HTMLElement);
  }

  function continueEditing() {
    if (busy) return;
    setDestination(null);
    requestAnimationFrame(() => returnOpener.current?.focus());
  }

  function discard() {
    if (!busy && destination !== null) router.push(destination);
  }

  return {
    isOpen: destination !== null,
    unknown,
    busy,
    navigate,
    navigateFromReference,
    continueEditing,
    discard,
  };
}

export function StorageLeaveConfirmation({
  navigation,
}: {
  navigation: ReturnType<typeof useStorageLeaveConfirmation>;
}) {
  return (
    <AlertDialog.Backdrop
      isOpen={navigation.isOpen}
      isKeyboardDismissDisabled={navigation.busy}
      onOpenChange={(open) => {
        if (!open) navigation.continueEditing();
      }}
    >
      <AlertDialog.Container
        placement="center"
        className="w-[calc(100%_-_32px)]! max-w-[480px] flex-none p-0!"
      >
        <AlertDialog.Dialog
          aria-label="放弃未保存的修改？"
          className="w-full max-w-none max-h-[calc(100dvh_-_32px)] gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-6"
        >
          <AlertDialog.Header className="p-0">
            <AlertDialog.Heading className="text-xl font-medium leading-normal">
              放弃未保存的修改？
            </AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body className="m-0! p-0 text-sm leading-normal">
            <p>
              {navigation.unknown
                ? '本次保存结果尚未确认。离开后请核对已保存配置。'
                : '当前修改尚未保存。'}
            </p>
          </AlertDialog.Body>
          <AlertDialog.Footer className="mt-0! flex-col gap-4 p-0">
            <Button
              className="h-12 w-full rounded-lg text-sm font-normal"
              isDisabled={navigation.busy}
              onPress={navigation.continueEditing}
            >
              继续编辑
            </Button>
            <Button
              variant="outline"
              className="h-12 w-full rounded-lg text-sm font-normal"
              isDisabled={navigation.busy}
              onPress={navigation.discard}
            >
              放弃修改
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
