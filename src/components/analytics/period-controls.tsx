'use client';

import { ToggleButtonGroup } from '@heroui/react/toggle-button-group';
import { ToggleButton } from '@heroui/react/toggle-button';
import type { ReportDays } from './read-analytics';

export function AnalyticsPeriods({
  days,
  onChange,
}: {
  days: ReportDays;
  onChange: (days: ReportDays) => void;
}) {
  return (
    <ToggleButtonGroup
      aria-label="统计周期"
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={new Set([String(days)])}
      onSelectionChange={(keys) => {
        const selected = Number([...keys][0]);
        if (selected === 7 || selected === 30 || selected === 90)
          onChange(selected);
      }}
      isDetached
      className="flex w-full justify-start gap-3 rounded-none bg-transparent p-0 min-[1200px]:w-fit min-[1200px]:justify-self-start"
    >
      {([7, 30, 90] as const).map((value) => (
        <ToggleButton
          key={value}
          id={String(value)}
          className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface px-4 text-sm text-foreground data-[selected=true]:border-accent data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground min-[1200px]:w-[104px] min-[1200px]:flex-none"
        >
          {value} 天
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
