'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@heroui/react/button';
import { Modal } from '@heroui/react/modal';

/** 本页分类、链接和历史遍历共用确认；刷新/关闭由浏览器自身提示。 */
export function useSiteNavigation(dirty: boolean) {
  const router = useRouter();
  const [destination, setDestination] = useState<
    string | { key: string } | null
  >(null);
  const leaving = useRef(false);
  const navigate = useCallback(
    (href: string) => {
      if (href === window.location.pathname) return;
      if (dirty && !leaving.current) setDestination(href);
      else router.push(href);
    },
    [dirty, router],
  );
  useEffect(() => {
    if (!dirty) return;
    function click(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest('a[href]')
          : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.download ||
        (link.target && link.target !== '_self')
      )
        return;
      const url = new URL(link.href);
      if (
        url.origin !== window.location.origin ||
        (url.pathname === window.location.pathname &&
          url.search === window.location.search)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      navigate(`${url.pathname}${url.search}${url.hash}`);
    }
    function warn(event: BeforeUnloadEvent) {
      if (leaving.current) return;
      event.preventDefault();
      event.returnValue = '';
    }
    function traverse(event: NavigateEvent) {
      if (event.navigationType === 'traverse' && leaving.current) {
        leaving.current = false;
        return;
      }
      if (
        event.defaultPrevented ||
        !event.cancelable ||
        event.navigationType !== 'traverse' ||
        !event.destination.sameDocument ||
        event.hashChange
      )
        return;
      event.preventDefault();
      setDestination({ key: event.destination.key });
    }
    document.addEventListener('click', click, true);
    window.addEventListener('beforeunload', warn);
    window.navigation.addEventListener('navigate', traverse);
    return () => {
      document.removeEventListener('click', click, true);
      window.removeEventListener('beforeunload', warn);
      window.navigation.removeEventListener('navigate', traverse);
    };
  }, [dirty, navigate]);
  return {
    destination,
    navigate,
    cancel: () => setDestination(null),
    discard: () => {
      if (!destination) return;
      leaving.current = true;
      setDestination(null);
      if (typeof destination === 'string') router.push(destination);
      else window.navigation.traverseTo(destination.key);
    },
  };
}

export function SiteLeaveDialog({
  navigation,
  pending,
}: {
  navigation: ReturnType<typeof useSiteNavigation>;
  pending: boolean;
}) {
  return (
    <Modal
      isOpen={navigation.destination !== null}
      onOpenChange={(open) => {
        if (!open) navigation.cancel();
      }}
    >
      <Modal.Backdrop isDismissable>
        <Modal.Container size="md" className="p-4">
          <Modal.Dialog
            aria-label="放弃未保存的修改?"
            className="max-h-[calc(100dvh-32px)] w-full max-w-120 gap-4 overflow-auto rounded-xl border border-border bg-surface p-6"
          >
            <Modal.Header>
              <Modal.Heading className="text-xl font-medium">
                放弃未保存的修改?
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="grid gap-3 text-sm leading-6">
              <p>
                {pending
                  ? '本次保存结果尚未确认，提交可能已到达服务器。离开后请核对已保存设置。'
                  : '当前站点信息尚未保存。放弃后使用服务器已保存设置。'}
              </p>
              <p>继续编辑会保留已填写的内容。</p>
            </Modal.Body>
            <Modal.Footer className="grid grid-cols-1 gap-4">
              <Button
                className="h-12 w-full rounded-lg"
                onPress={navigation.cancel}
              >
                继续编辑
              </Button>
              <Button
                variant="outline"
                className="h-12 w-full rounded-lg"
                onPress={navigation.discard}
              >
                放弃修改
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
