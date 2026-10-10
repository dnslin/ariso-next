import type { ReactNode } from 'react';
import { Card } from '@heroui/react/card';
import { Link } from '@heroui/react/link';
import { buttonVariants } from '@heroui/react/button';

export const number = (value: number) =>
  new Intl.NumberFormat('zh-CN').format(value);
export function bytes(value: number) {
  if (value === 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: index ? 1 : 0 }).format(value / 1024 ** index)} ${units[index]}`;
}
export function timestamp(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}
export function AnalyticsCard({
  title,
  children,
  testId,
}: {
  title: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <Card
      data-testid={testId}
      className="min-w-0 gap-3 rounded-[20px] border border-border bg-surface px-4 py-5 shadow-none min-[1200px]:px-6"
    >
      <h2 className="text-lg font-medium leading-[22px]">{title}</h2>
      {children}
    </Card>
  );
}
export function AnalyticsLink({
  href,
  children,
  primary = false,
  footer = false,
}: {
  href: string;
  children: ReactNode;
  primary?: boolean;
  footer?: boolean;
}) {
  return (
    <Link
      href={href}
      className={buttonVariants({
        variant: primary ? 'primary' : 'outline',
        className: `h-12 min-w-0 rounded-lg px-4 text-sm ${footer ? 'flex-1 min-[1200px]:max-w-[200px]' : 'w-full'}`,
      })}
    >
      {children}
    </Link>
  );
}
export const tableClass =
  'rounded-none border-0 bg-transparent shadow-none [&_[data-slot=table-header]]:bg-transparent [&_[data-slot=table-column]]:rounded-none [&_[data-slot=table-column]]:bg-transparent [&_[data-slot=table-column]]:after:hidden [&_[data-slot=table-cell]]:rounded-none [&_[data-slot=table-cell]]:bg-transparent [&_[data-slot=table-row]]:bg-transparent';
