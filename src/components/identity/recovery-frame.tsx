import type { ReactNode, Ref } from 'react';
import { Link } from '@heroui/react/link';

export const recoveryActionClass =
  'flex min-h-12! w-full items-center justify-center rounded-lg px-3 text-center text-sm font-normal';

export function RecoveryLogin({ primary = false }: { primary?: boolean }) {
  return (
    <Link
      href="/login"
      data-testid="reset-login"
      className={`${recoveryActionClass} ${primary ? 'bg-accent text-accent-foreground' : 'text-foreground'}`}
    >
      返回登录
    </Link>
  );
}

export function RecoveryCliLink({ primary = false }: { primary?: boolean }) {
  return (
    <Link
      href="/forgot-password?view=cli"
      data-testid="reset-cli"
      className={`${recoveryActionClass} ${primary ? 'bg-accent text-accent-foreground' : 'text-foreground'}`}
    >
      查看终端恢复方法
    </Link>
  );
}

export function RecoveryFrame({
  state,
  title,
  children,
  headingRef,
}: {
  state: string;
  title: string;
  children: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const form = state === 'form';
  return (
    <div
      className={`grid min-h-dvh content-start justify-items-center px-4 pb-8 ${form ? 'pt-[150px] min-[768px]:pt-[330px]' : 'pt-[130px] min-[768px]:pt-[170px]'}`}
    >
      <section
        data-testid="reset-page"
        data-state={state}
        aria-labelledby="recovery-heading"
        aria-busy={state === 'pending'}
        className={`grid w-full min-w-0 gap-4 rounded-[20px] border border-dashed border-border bg-surface px-6 text-sm leading-[1.5] dark:border-solid min-[768px]:rounded-3xl ${form ? 'max-w-md py-6' : 'max-w-[480px] py-7 min-[768px]:px-8'}`}
      >
        <h1
          id="recovery-heading"
          ref={headingRef}
          tabIndex={-1}
          className={`${form ? 'text-2xl' : 'text-[22px]'} font-medium`}
        >
          {title}
        </h1>
        {children}
      </section>
    </div>
  );
}
