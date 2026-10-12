import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@heroui/react/button';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Popover } from '@heroui/react/popover';
import { SearchField } from '@heroui/react/search-field';
import { Select } from '@heroui/react/select';
import { Tooltip } from '@heroui/react/tooltip';
import { CircleHelp, Search } from 'lucide-react';

export type Scenario = 'empty' | 'sample' | 'attention';
export const PrototypeContext = createContext<{
  scenario: Scenario;
  navigate: (href: string) => void;
  notify: (message: string) => void;
  footerTarget: HTMLElement | null;
}>({
  scenario: 'empty',
  navigate: () => {},
  notify: () => {},
  footerTarget: null,
});
export const usePrototype = () => useContext(PrototypeContext);

export function PageHeader({
  title,
  children,
  help,
}: {
  title: string;
  children?: ReactNode;
  help?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="break-words">{title}</h1>
        {help}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </header>
  );
}

export function Help({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <Tooltip>
        <Button
          isIconOnly
          variant="ghost"
          className="prototype-icon-button"
          aria-label={label}
        >
          <CircleHelp size={18} aria-hidden />
        </Button>
        <Tooltip.Content>{label}</Tooltip.Content>
      </Tooltip>
      <Popover.Content className="max-w-[min(360px,calc(100vw-32px))] rounded-xl border border-border bg-surface p-4 shadow-lg">
        <Popover.Dialog
          aria-label={label}
          className="grid gap-3 text-sm leading-relaxed"
        >
          {children}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

export function Footer({ children }: { children: ReactNode }) {
  const { footerTarget } = usePrototype();
  return footerTarget ? createPortal(children, footerTarget) : null;
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string; disabled?: boolean }[];
  className?: string;
}) {
  return (
    <Select
      aria-label={label}
      value={value}
      onChange={(next) => {
        if (next !== null) onChange(String(next));
      }}
      className={`min-w-0 gap-2 ${className}`}
    >
      <Label className="text-sm font-normal">{label}</Label>
      <Select.Trigger className="h-12 w-full rounded-lg border border-border bg-background px-3 shadow-none">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover
        data-prototype-select
        className="rounded-xl border border-border bg-surface p-1.5 shadow-lg"
      >
        <ListBox
          disabledKeys={options
            .filter((option) => option.disabled)
            .map((option) => option.id)}
        >
          {options.map((option) => (
            <ListBox.Item
              data-prototype-option
              key={option.id}
              id={option.id}
              textValue={option.label}
              className="min-h-11 rounded-lg px-3 text-sm"
            >
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

export function SearchInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <SearchField
      aria-label={label}
      value={value}
      onChange={onChange}
      className="min-w-0 flex-1"
    >
      <SearchField.Group className="h-12 rounded-lg border border-border bg-background pl-3 shadow-none">
        <Search size={18} className="shrink-0" aria-hidden />
        <SearchField.Input
          className="min-w-0 px-2 text-base md:text-sm"
          placeholder={placeholder ?? label}
        />
        <SearchField.ClearButton
          aria-label={`清空${label}`}
          className="size-11 shrink-0"
        />
      </SearchField.Group>
    </SearchField>
  );
}

export function Metric({
  label,
  value,
  icon,
  children,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="prototype-metric">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="prototype-muted">{icon}</span>
      </div>
      <p className="text-[28px] font-medium tabular-nums leading-tight">
        {value}
      </p>
      {children}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="prototype-empty">
      <span aria-hidden>{icon}</span>
      <h2 className="text-lg font-medium">{title}</h2>
      {children}
    </div>
  );
}
