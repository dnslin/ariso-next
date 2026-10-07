import type { ReactNode } from 'react';

export const accountActionClass =
  'h-11 min-h-11 w-fit min-w-24 shrink-0 rounded-lg px-4 text-sm font-normal';
export const accountSurfaceClass =
  'grid min-w-0 gap-0 overflow-hidden rounded-2xl border border-border bg-surface p-0 shadow-none';

export function AccountSettingRow({
  label,
  icon,
  children,
  action,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      data-testid="account-setting-row"
      className="grid min-w-0 grid-cols-[116px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-border px-4 py-4 [&+div]:border-t sm:grid-cols-[136px_minmax(0,1fr)_auto] sm:gap-5 sm:px-5"
    >
      <div className="flex min-w-0 items-center gap-2 text-[13px] text-muted">
        {icon}
        <span>{label}</span>
      </div>
      <div className="min-w-0 text-sm">{children}</div>
      {action ? (
        <div className="col-start-2 flex shrink-0 items-center gap-2 sm:col-start-3">
          {action}
        </div>
      ) : null}
    </div>
  );
}
