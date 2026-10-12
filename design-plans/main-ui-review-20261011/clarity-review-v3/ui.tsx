import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@heroui/react/button';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { TextField } from '@heroui/react/textfield';
import { FieldError } from '@heroui/react/field-error';
import { Save } from 'lucide-react';
export { StorageTip as Help } from '../../../src/components/storage/storage-tip';
export {
  ActionIconButton,
  actionGroupClass as groupClass,
} from '../../../src/components/library/action-button';
export {
  Dialog,
  VisibilityBadge,
  SearchInput,
  SelectField,
} from '../interaction-review-v2/ui';

export type Scenario = 'normal' | 'slow' | 'error' | 'empty';
export const AppContext = createContext<{
  navigate: (href: string) => void;
  footerTarget: HTMLElement | null;
  scenario: Scenario;
}>({ navigate: () => {}, footerTarget: null, scenario: 'normal' });
export const useApp = () => useContext(AppContext);
export const buttonClass = 'h-11 min-h-11 gap-2 rounded-lg px-4 text-sm';
export const panelClass =
  'min-w-0 rounded-[20px] border border-border bg-surface';
export function Footer({ children }: { children: ReactNode }) {
  const { footerTarget } = useApp();
  return footerTarget ? createPortal(children, footerTarget) : null;
}
export function Header({
  title,
  children,
  help,
}: {
  title: string;
  children?: ReactNode;
  help?: ReactNode;
}) {
  return (
    <header className="flex min-w-0 items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-1">
        <h1 className="min-w-0 break-words text-2xl font-semibold md:text-[28px]">
          {title}
        </h1>
        {help}
      </div>
      {children}
    </header>
  );
}
export function SectionHeading({
  title,
  icon,
  help,
}: {
  title: string;
  icon: ReactNode;
  help?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <h2 className="flex min-w-0 items-center gap-2 text-lg font-medium">
        <span
          className="flex size-5 shrink-0 items-center justify-center [&_svg]:size-5"
          aria-hidden
        >
          {icon}
        </span>
        {title}
      </h2>
      {help}
    </div>
  );
}
export function Field({
  label,
  value,
  onChange,
  type = 'text',
  error,
  help,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  error?: string;
  help?: ReactNode;
  placeholder?: string;
}) {
  return (
    <TextField
      value={value}
      onChange={onChange}
      type={type}
      isInvalid={!!error}
      validationBehavior="aria"
      className="min-w-0 gap-2"
    >
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        {help}
      </div>
      <Input
        placeholder={placeholder}
        className="h-12 min-w-0 rounded-lg border border-border bg-background px-3.5 text-sm shadow-none"
      />
      <FieldError>{error}</FieldError>
    </TextField>
  );
}
export function SaveButton({
  onPress,
  disabled,
  pending,
  label = '保存',
}: {
  onPress: () => void;
  disabled?: boolean;
  pending?: boolean;
  label?: string;
}) {
  return (
    <Button
      className={buttonClass}
      onPress={onPress}
      isDisabled={disabled}
      isPending={pending}
    >
      <Save size={17} aria-hidden />
      {label}
    </Button>
  );
}
