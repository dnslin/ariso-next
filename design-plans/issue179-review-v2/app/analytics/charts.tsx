'use client';

import { trendSample } from './sample';

import {
  Area,
  AreaChart,
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
  type TooltipValueType,
} from 'recharts';

const versions = [
  { name: '原图', count: 862, color: 'var(--chart-1)' },
  { name: '压缩图', count: 284, color: 'var(--chart-2)' },
  { name: '水印图', count: 102, color: 'var(--chart-3)' },
];
const windows = [
  { name: '近7天', count: 186 },
  { name: '近30天', count: 624 },
  { name: '近90天', count: 1032 },
];
const axis = {
  tickLine: false,
  axisLine: false,
  fontSize: 12,
  stroke: 'var(--muted)',
};

function ChartTip({
  active,
  payload,
  label,
}: TooltipContentProps<TooltipValueType, string | number>) {
  return active && payload?.length ? (
    <div className="chart-tip">
      {label ?? payload[0].name}
      <strong>{Number(payload[0].value).toLocaleString()} 次</strong>
    </div>
  ) : null;
}

export function VersionChart({
  zero = false,
  values,
}: {
  zero?: boolean;
  values: number[];
}) {
  const data = versions.map((v, i) => ({ ...v, count: zero ? 0 : values[i] }));
  return (
    <div
      className="version-chart"
      role="img"
      aria-label={data.map((v) => `${v.name}${v.count}次`).join('，')}
    >
      {data.map((v) => (
        <div className="version-row" key={v.name}>
          <span className="version-label">
            <i style={{ background: v.color }} />
            {v.name}
          </span>
          <div className="version-track">
            <div
              className="version-fill"
              style={{
                background: v.color,
                transform: `scaleX(${v.count / Math.max(1, ...values)})`,
              }}
            />
          </div>
          <strong>
            {v.count.toLocaleString()}
            <small>次</small>
          </strong>
        </div>
      ))}
    </div>
  );
}

export function PeriodChart({
  zero = false,
  values,
}: {
  zero?: boolean;
  values: number[];
}) {
  return (
    <div
      className="period-chart"
      role="img"
      aria-label={windows
        .map((w, i) => `${w.name}${zero ? 0 : values[i]}次`)
        .join('，')}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart
          data={windows.map((w, i) => ({ ...w, count: zero ? 0 : values[i] }))}
          accessibilityLayer
          margin={{ top: 30, right: 28, bottom: 0, left: 0 }}
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--chart-grid)"
            strokeDasharray="3 5"
          />
          <XAxis
            dataKey="name"
            {...axis}
            dy={8}
            padding={{ left: 24, right: 12 }}
          />
          <YAxis
            {...axis}
            width={45}
            allowDecimals={false}
            domain={[0, 'auto']}
          />
          <Tooltip content={ChartTip} isAnimationActive={false} />
          <Line
            type="linear"
            dataKey="count"
            name="访问量"
            stroke="var(--chart-2)"
            strokeWidth={2.5}
            dot={{ r: 4, fill: 'var(--surface)', strokeWidth: 2 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
            label={{
              position: 'top',
              fill: 'var(--foreground)',
              fontSize: 13,
              offset: 12,
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChart({ days }: { days: number }) {
  const data = trendSample(days);
  return (
    <div className="overview-chart">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart
          data={data}
          accessibilityLayer
          margin={{ top: 12, right: 10, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id="trend-shade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="var(--chart-grid)"
            strokeDasharray="3 5"
          />
          <XAxis dataKey="date" {...axis} minTickGap={40} />
          <YAxis {...axis} width={48} allowDecimals={false} />
          <Tooltip content={ChartTip} isAnimationActive={false} />
          <Area
            type="monotone"
            dataKey="count"
            name="公开访问"
            stroke="var(--chart-2)"
            strokeWidth={2.5}
            fill="url(#trend-shade)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
