import type { ReactNode } from 'react';
import {
  Button,
  Input,
  Label,
  ListBox,
  Modal,
  Select,
  TextField,
} from '@heroui/react';
import { X } from 'lucide-react';

export const primary =
  'min-h-11 rounded-lg bg-accent px-5 text-sm font-semibold text-accent-foreground shadow-none';
export const secondary =
  'min-h-11 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-foreground shadow-none';

export function Choice({
  label,
  value,
  options,
  onChange,
  disabled = false,
  compact = false,
  className,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Select
      aria-label={label}
      value={value}
      onChange={(key) => key !== null && onChange(String(key))}
      isDisabled={disabled}
      className={className ?? 'w-full min-w-0'}
    >
      {!compact && <Label className="mb-2 text-sm font-medium">{label}</Label>}
      <Select.Trigger
        className={`${compact ? 'text-xs' : 'text-sm'} min-h-11 w-full rounded-lg border border-border bg-surface px-3 shadow-none`}
      >
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover className="rounded-xl border border-border bg-surface p-1">
        <ListBox>
          {options.map(([id, name]) => (
            <ListBox.Item
              key={id}
              id={id}
              textValue={name}
              className="min-h-11 rounded-lg text-sm"
            >
              {name}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'password' | 'url';
  disabled?: boolean;
  error?: string;
}) {
  return (
    <TextField
      value={value}
      onChange={onChange}
      type={type}
      isDisabled={disabled}
      isInvalid={!!error}
      className="grid min-w-0 gap-2"
    >
      <Label className="text-sm font-medium">{label}</Label>
      <Input
        type={type}
        autoComplete="off"
        className="h-11 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-sm shadow-none"
        placeholder={placeholder}
      />
      {error && <p className="text-xs leading-5 text-danger">{error}</p>}
    </TextField>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  pending = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  pending?: boolean;
}) {
  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(next) => !next && onClose()}
      isDismissable={!pending}
      isKeyboardDismissDisabled={pending}
      className="bg-black/25 backdrop-blur-sm"
    >
      <Modal.Container
        size="sm"
        placement="center"
        scroll="inside"
        className="p-3"
      >
        <Modal.Dialog
          aria-label={title}
          className="w-full max-w-[360px] rounded-xl border border-border bg-surface p-5 shadow-xl"
        >
          <Modal.Header className="mb-5 pr-9">
            <Modal.Heading className="text-base font-semibold">
              {title}
            </Modal.Heading>
          </Modal.Header>
          <Button
            slot="close"
            isDisabled={pending}
            isIconOnly
            aria-label="关闭弹窗"
            variant="ghost"
            className="absolute top-2 right-2 size-11 rounded-lg"
          >
            <X size={18} />
          </Button>
          <Modal.Body className="grid min-w-0 gap-4 p-0">{children}</Modal.Body>
          {footer && (
            <Modal.Footer className="mt-5 flex flex-wrap justify-end gap-2 p-0">
              {footer}
            </Modal.Footer>
          )}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

export function messageOf(error: unknown) {
  return error instanceof Error ? error.message : '操作未完成，请重试。';
}
