'use client';

import { useRef, useState } from 'react';
import { Button, Form, Modal } from '@heroui/react';
import type { QueryClient } from '@tanstack/react-query';
import { tagRequest, TagRequestError } from '../tags/api';
import { LibraryFilterOptionsField } from './library-filter-options';
import { SmartCollectionRequestError } from './smart-collection-client';

export function ScreenshotTemplateDialog({
  client,
  onApply,
  onClose,
  onSessionExpired,
}: {
  client: QueryClient;
  onApply: (tagIds: string[]) => Promise<boolean>;
  onClose: () => void;
  onSessionExpired: () => void;
}) {
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [pending, setPending] = useState<'create' | 'apply' | null>(null);
  const [error, setError] = useState('');
  const [creationUnknown, setCreationUnknown] = useState(false);
  const inFlight = useRef(false);

  function close() {
    if (!inFlight.current) onClose();
  }
  async function createTag() {
    if (inFlight.current || creationUnknown) return;
    inFlight.current = true;
    setPending('create');
    setError('');
    try {
      const result = await tagRequest<{ tag: { id: string } }>('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '截图' }),
      });
      setTagIds([result.tag.id]);
      await client.invalidateQueries({ queryKey: ['library-filter-options'] });
    } catch (cause) {
      if (cause instanceof TagRequestError && cause.status === 401)
        onSessionExpired();
      const unknown =
        !(cause instanceof TagRequestError) || cause.status >= 500;
      setCreationUnknown(unknown);
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(
        unknown
          ? `${message}。标签创建结果尚未确认，请从标签列表核对并选择已有标签，勿重复创建。`
          : message,
      );
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }
  async function apply() {
    if (inFlight.current || !tagIds.length) return;
    inFlight.current = true;
    setPending('apply');
    setError('');
    try {
      if (await onApply(tagIds)) onClose();
      else setError('未能应用截图条件，标签选择已保留。请重试。');
    } catch (cause) {
      if (cause instanceof SmartCollectionRequestError && cause.status === 401)
        onSessionExpired();
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }

  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Modal.Backdrop
        isDismissable={pending === null}
        isKeyboardDismissDisabled={pending !== null}
      >
        <Modal.Container placement="center" className="p-4">
          <Modal.Dialog
            aria-label="选择截图标签"
            className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 overflow-y-auto rounded-2xl p-6"
          >
            <Modal.Header>
              <Modal.Heading>选择截图标签</Modal.Heading>
            </Modal.Header>
            <Form
              className="grid gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                void apply();
              }}
            >
              <Modal.Body className="grid gap-4 px-0">
                <p className="text-sm text-muted">
                  选择用来标记截图的真实标签，模板按最近 7 天筛选。
                </p>
                <LibraryFilterOptionsField
                  kind="tags"
                  label="截图标签"
                  selectedIds={tagIds}
                  onChange={setTagIds}
                  client={client}
                  onSessionExpired={onSessionExpired}
                  disabled={pending !== null}
                  presentation="field"
                />
                <Button
                  variant="ghost"
                  className="min-h-11 rounded-lg"
                  isDisabled={pending !== null || creationUnknown}
                  onPress={() => void createTag()}
                >
                  创建“截图”标签
                </Button>
                {error && (
                  <p role="alert" className="text-sm text-danger">
                    {error}
                  </p>
                )}
              </Modal.Body>
              <Modal.Footer className="gap-3 px-0">
                <Button
                  variant="secondary"
                  className="min-h-12 flex-1 rounded-lg text-foreground"
                  isDisabled={pending !== null}
                  onPress={close}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  className="min-h-12 flex-1"
                  isDisabled={pending !== null || !tagIds.length}
                >
                  {pending === 'apply' ? '正在应用…' : '应用模板'}
                </Button>
              </Modal.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
