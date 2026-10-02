'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { CloseButton } from '@heroui/react/close-button';
import { FieldError } from '@heroui/react/field-error';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { Modal } from '@heroui/react/modal';
import { TextField } from '@heroui/react/textfield';
import { tagNameSchema } from '../../server/collections/validation';
import type { UploadRelation } from './types';

export function UploadCreateTag({
  isOpen,
  onClose,
  onComplete,
  onExpire,
}: {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (tag: UploadRelation) => void;
  onExpire: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function create() {
    if (inFlight.current) return;
    const parsed = tagNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: parsed.data.displayName }),
        cache: 'no-store',
      });
      const result = await response.json();
      if (!mounted.current) return;
      if (response.status === 401) {
        onExpire();
        return;
      }
      if (!response.ok)
        throw new Error(`${result.message}（HTTP ${response.status}）`);
      onComplete({ id: result.tag.id, name: result.tag.displayName });
    } catch (error) {
      if (mounted.current)
        setError(
          `${error instanceof Error ? error.message : String(error)}。输入和原有选择已保留。`,
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <Modal.Backdrop
        isDismissable={!pending}
        isKeyboardDismissDisabled={pending}
      >
        <Modal.Container placement="center" className="p-4">
          <Modal.Dialog
            data-testid="upload-create-tag"
            className="max-h-[calc(var(--visual-viewport-height)-32px)] w-full max-w-120 gap-3 overflow-y-auto rounded-3xl bg-surface px-4 py-5 shadow-[0_16px_48px_rgba(38,36,66,0.16)] md:p-6"
          >
            <Modal.Header className="flex min-h-11 flex-row items-center justify-between gap-3">
              <Modal.Heading className="text-lg font-medium">
                新建标签
              </Modal.Heading>
              <CloseButton
                aria-label="关闭新建标签"
                isDisabled={pending}
                className="size-11 shrink-0 bg-transparent hover:bg-transparent data-[hovered=true]:bg-transparent data-[pressed=true]:transform-none"
                onPress={onClose}
              />
            </Modal.Header>
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void create();
              }}
            >
              <Modal.Body className="m-0 grid gap-3 overflow-visible p-0 text-foreground">
                <TextField
                  value={name}
                  onChange={setName}
                  isInvalid={!!error}
                  isDisabled={pending}
                  validationBehavior="aria"
                  className="gap-3"
                >
                  <Label className="text-sm font-normal">
                    标签名称 · 1–50 个字符
                  </Label>
                  <Input
                    autoFocus
                    className="min-h-11 w-full rounded-xl border border-border bg-background px-3.5 text-base shadow-none md:text-sm"
                  />
                  <FieldError>{error}</FieldError>
                </TextField>
              </Modal.Body>
              <Modal.Footer className="mt-0 grid w-full grid-cols-2 justify-stretch gap-2 pt-2 md:flex md:justify-end">
                <Button
                  variant="ghost"
                  isDisabled={pending}
                  className="min-h-11 w-full rounded-xl md:h-10 md:min-h-10 md:w-29"
                  onPress={onClose}
                >
                  <span className="md:hidden">取消</span>
                  <span className="hidden md:inline">关闭</span>
                </Button>
                <Button
                  type="submit"
                  isDisabled={pending}
                  className="min-h-11 w-full rounded-xl md:h-10 md:min-h-10 md:w-29"
                >
                  {pending ? '正在创建…' : '创建标签'}
                </Button>
              </Modal.Footer>
            </form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
