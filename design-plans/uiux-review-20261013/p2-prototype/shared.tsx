import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@heroui/react/button';
import { ArrowLeft } from 'lucide-react';

export type Mode = 'before' | 'after';
export const PrototypeContext = createContext<{
  mode: Mode;
  href: string;
  navigate: (href: string) => void;
  footerTarget: HTMLElement | null;
}>({
  mode: 'after',
  href: '/',
  navigate: () => {},
  footerTarget: null,
});
export const usePrototype = () => useContext(PrototypeContext);
export const buttonClass = 'min-h-11 rounded-lg px-4 text-sm font-normal';
export const cardClass =
  'min-w-0 gap-4 rounded-[20px] border border-border bg-surface p-4 shadow-none min-[1200px]:p-6';

export function Footer({ children }: { children: ReactNode }) {
  const { footerTarget } = usePrototype();
  return footerTarget ? createPortal(children, footerTarget) : null;
}

export function PageHeader({
  title,
  back,
  children,
}: {
  title: string;
  back?: () => void;
  children?: ReactNode;
}) {
  return (
    <header className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <h1 className="min-w-0 text-[28px] font-medium leading-normal md:text-[30px]">
        {title}
      </h1>
      {back ? (
        <Button variant="ghost" className={buttonClass} onPress={back}>
          <ArrowLeft size={18} aria-hidden />
          返回
        </Button>
      ) : (
        children
      )}
    </header>
  );
}
