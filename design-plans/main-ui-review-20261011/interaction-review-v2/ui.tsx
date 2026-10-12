import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@heroui/react/button';
import { ButtonGroup } from '@heroui/react/button-group';
import { CloseButton } from '@heroui/react/close-button';
import { Dropdown } from '@heroui/react/dropdown';
import { Modal } from '@heroui/react/modal';
import { Tooltip } from '@heroui/react/tooltip';
import { ArrowLeft, Globe, LockKeyhole } from 'lucide-react';
export { SearchInput, SelectField, EmptyState } from '../prototype/shared';
export const AppContext = createContext<{
  navigate: (href: string) => void;
  footerTarget: HTMLElement | null;
}>({ navigate: () => {}, footerTarget: null });
export const useApp = () => useContext(AppContext);
export const buttonClass = 'h-11 min-h-11 gap-2 rounded-lg px-4 text-sm';
export const iconClass = 'size-11 min-h-11 min-w-11 shrink-0 rounded-lg p-0';
export const groupClass =
  'shrink-0 rounded-lg [&_.button]:rounded-none [&_.button:first-child]:rounded-s-lg [&_.button:last-child]:rounded-e-lg';
export const menuClass =
  'flex max-h-[min(480px,calc(100dvh-32px))] flex-col overflow-hidden rounded-lg border border-border bg-surface p-1.5 shadow-lg';
export function Footer({ children }: { children: ReactNode }) {
  const { footerTarget } = useApp();
  return footerTarget ? createPortal(children, footerTarget) : null;
}
export function Header({
  title,
  back,
  children,
}: {
  title: string;
  back?: () => void;
  children?: ReactNode;
}) {
  return (
    <header className="flex min-w-0 items-center justify-between gap-4">
      <h1 className="min-w-0 break-words text-2xl font-semibold md:text-[28px]">
        {title}
      </h1>
      {back ? (
        <Button
          variant="ghost"
          className={`${buttonClass} shrink-0`}
          onPress={back}
        >
          <ArrowLeft size={18} aria-hidden />
          返回
        </Button>
      ) : (
        children
      )}
    </header>
  );
}
export function IconButton({
  label,
  children,
  onPress,
  disabled = false,
  separator = false,
  variant = 'tertiary',
  className = '',
}: {
  label: string;
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  separator?: boolean;
  variant?: 'primary' | 'tertiary';
  className?: string;
}) {
  return (
    <Tooltip>
      <Button
        isIconOnly
        variant={variant}
        aria-label={label}
        isDisabled={disabled}
        className={`${iconClass} ${className}`}
        onPress={onPress}
      >
        {separator ? <ButtonGroup.Separator /> : null}
        {children}
      </Button>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}
export type MenuItem = {
  id: string;
  label: string;
  icon: ReactNode;
  danger?: boolean;
  disabled?: boolean;
};
export function MenuItems({
  items,
  label,
  onAction,
}: {
  items: MenuItem[];
  label: string;
  onAction: (id: string) => void;
}) {
  return (
    <Dropdown.Menu
      aria-label={label}
      className="min-h-0 overflow-y-auto"
      onAction={(key) => onAction(String(key))}
    >
      {items.map((item) => (
        <Dropdown.Item
          key={item.id}
          id={item.id}
          textValue={item.label}
          isDisabled={item.disabled}
          className={`min-h-11 gap-3 rounded-md px-3 text-sm ${item.danger ? 'text-danger' : ''}`}
        >
          {item.icon}
          {item.label}
        </Dropdown.Item>
      ))}
    </Dropdown.Menu>
  );
}
export function VisibilityBadge({ value }: { value: 'public' | 'private' }) {
  return (
    <span
      data-visibility={value}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] leading-none ${value === 'public' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-200'}`}
    >
      {value === 'public' ? (
        <Globe size={12} aria-hidden />
      ) : (
        <LockKeyhole size={12} aria-hidden />
      )}
      {value === 'public' ? '公开' : '私有'}
    </span>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  footer,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}) {
  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Container placement="center" size="lg" className="p-4">
        <Modal.Dialog className="m-auto flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-160 flex-col gap-0 overflow-hidden rounded-lg border border-border bg-surface p-0">
          <Modal.Header className="flex shrink-0 flex-row items-center justify-between gap-3 border-b border-border px-5 py-3 text-left">
            <Modal.Heading className="text-lg font-medium">
              {title}
            </Modal.Heading>
            <CloseButton
              aria-label={`关闭${title}`}
              className={iconClass}
              onPress={onClose}
            />
          </Modal.Header>
          <Modal.Body className="m-0 min-h-0 overflow-y-auto p-5">
            {children}
          </Modal.Body>
          {footer ? (
            <Modal.Footer className="m-0 flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-border p-4">
              {footer}
            </Modal.Footer>
          ) : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
