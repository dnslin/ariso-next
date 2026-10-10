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
import type { AnalyticsOverview } from './read-analytics';

export default function TrendChart({
  trend,
}: {
  trend: AnalyticsOverview['trend'];
}) {
  return (
    <div className="h-[180px] min-w-0 text-xs" data-testid="analytics-chart">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart
          data={trend}
          accessibilityLayer
          margin={{ top: 12, right: 8, bottom: 0, left: -12 }}
          aria-label="每日公开访问量折线图，使用左右方向键读取，或查看每日数值表"
        >
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(date: string) => date.slice(5).replace('-', '/')}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            stroke="var(--muted)"
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={48}
            stroke="var(--muted)"
            domain={[0, 'auto']}
          />
          <Tooltip
            isAnimationActive={false}
            trigger="click"
            content={({ active, label, payload }) =>
              active && payload.length ? (
                <div
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-sm"
                  role="status"
                >
                  {label} · {payload[0].value} 次
                </div>
              ) : null
            }
          />
          <Line
            type="linear"
            dataKey="count"
            name="访问量"
            stroke="var(--foreground)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
