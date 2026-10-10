'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalyticsImageStats } from './read-analytics';
import { number } from './presentation';

export default function ImageStatisticsChart({
  periods,
}: {
  periods: AnalyticsImageStats['periods'];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <LineChart
        data={periods.map((period) => ({
          name: `近${period.days}天`,
          count: period.total,
        }))}
        accessibilityLayer
        aria-label="近期访问周期合计，使用左右方向键读取三个总量；各周期相互包含，不是逐日趋势"
        margin={{ top: 30, right: 28, bottom: 8, left: 0 }}
      >
        <CartesianGrid
          vertical={false}
          stroke="var(--analytics-grid)"
          strokeDasharray="3 5"
        />
        <XAxis
          dataKey="name"
          tickLine={false}
          axisLine={false}
          fontSize={12}
          stroke="var(--muted)"
          dy={8}
          padding={{ left: 24, right: 12 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          fontSize={12}
          stroke="var(--muted)"
          width={45}
          allowDecimals={false}
          domain={[0, 'auto']}
        />
        <Tooltip
          trigger="click"
          isAnimationActive={false}
          content={({ active, label, payload }) =>
            active && payload.length ? (
              <div
                className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground shadow-sm"
                role="status"
              >
                {label}
                <strong className="mt-1 block text-sm font-medium">
                  {number(Number(payload[0].value))} 次
                </strong>
              </div>
            ) : null
          }
        />
        <Line
          type="linear"
          dataKey="count"
          name="访问量"
          stroke="var(--analytics-compressed)"
          strokeWidth={2.5}
          dot={{ r: 4, fill: 'var(--surface)', strokeWidth: 2 }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
          label={{
            position: 'top',
            fill: 'var(--foreground)',
            fontSize: 13,
            offset: 12,
            formatter: (value: unknown) => number(Number(value)),
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
