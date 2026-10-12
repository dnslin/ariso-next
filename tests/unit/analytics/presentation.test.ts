import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  AnalyticsMetadata,
  AnalyticsMetrics,
} from '../../../src/components/analytics/overview-summary';
import {
  AnalyticsTrend,
  AnalyticsVersions,
  AnalyticsFailures,
} from '../../../src/components/analytics/overview-content';
import { AnalyticsPopular } from '../../../src/components/analytics/popular';
import {
  UsageContent,
  UsageSummary,
} from '../../../src/components/analytics/usage-content';
import {
  DashboardPanel,
  DashboardResources,
} from '../../../src/components/analytics/dashboard-panel';
import { AnalyticsOverviewPanel } from '../../../src/components/analytics/overview-panel';
import { AnalyticsLoading } from '../../../src/components/analytics/query-state';
import TrendChart from '../../../src/components/analytics/trend-chart';
import type {
  AnalyticsOverview,
  AnalyticsUsage,
} from '../../../src/components/analytics/read-analytics';

function overview(
  overrides: Partial<AnalyticsOverview> = {},
): AnalyticsOverview {
  return {
    counts: {
      albums: 0,
      normalImages: 0,
      recycledImages: 0,
      initialProcessingFailures: 0,
      reprocessFailures: 0,
    },
    generatedAt: '2026-10-09T04:30:00.000Z',
    timezone: 'Asia/Shanghai',
    lastFlushedAt: null,
    health: {
      accepted: 0,
      flushed: 0,
      dropped: 0,
      incomplete: false,
      pendingKeys: 0,
      pendingEvents: 0,
      lastFlushedAt: null,
      lastError: null,
      nextRetryAt: 0,
      status: 'idle',
    },
    approximate: true,
    containsOldTimezone: false,
    range: { days: 7, startDate: '2026-10-03', endDate: '2026-10-09' },
    cumulative: { original: 0, compressed: 0, watermark: 0, total: 0 },
    versions: { original: 0, compressed: 0, watermark: 0, total: 0 },
    today: 0,
    trend: [],
    popular: [],
    ...overrides,
  };
}
const html = <Props extends object>(
  component: (props: Props) => React.ReactNode,
  props: Props,
) => renderToStaticMarkup(createElement(component, props));

describe('analytics presentation from real report fields', () => {
  it('reserves the loaded chart height before its dynamic module arrives', () => {
    const loading = html(AnalyticsTrend, {
      data: overview(),
      dailyUrl: '/analytics?days=7&view=daily',
    });
    const loaded = html(TrendChart, { trend: [] });
    for (const height of ['h-[220px]', 'sm:h-[252px]']) {
      expect(loading).toContain(height);
      expect(loaded).toContain(height);
    }
  });
  it('announces the first read without displaying a zero result', () => {
    for (const scope of ['overview', 'usage'] as const) {
      const reading = html(AnalyticsLoading, { scope });
      expect(reading).toContain('aria-busy="true"');
      expect(reading).toContain('role="status"');
      expect(reading).toContain('请稍候');
      expect(reading).toContain(
        scope === 'overview' ? '首次读取统计' : '正在读取存储占用',
      );
      expect(reading).not.toContain('暂无访问');
      expect(reading).not.toContain('0 次');
    }
  });
  it('keeps retained history visible when the current image library is empty', () => {
    const data = overview({
      cumulative: { original: 980, compressed: 20, watermark: 0, total: 1000 },
      versions: { original: 12, compressed: 0, watermark: 0, total: 12 },
    });
    const metrics = html(AnalyticsMetrics, { data });
    expect(metrics).toContain('1,000');
    const trend = html(AnalyticsTrend, {
      data,
      dailyUrl: '/analytics?days=7&view=daily',
    });
    expect(trend).toContain('12');
    expect(trend).not.toContain('暂无访问');
    const popular = html(AnalyticsPopular, { data, onStatistics: () => {} });
    expect(popular).toContain('本周期暂无热门图片');
    expect(popular).not.toContain('已删除图片');
    expect(popular).not.toContain('href=');
    expect(popular).not.toContain('data-image-id=');
  });
  it('renders retained recycled, private and unavailable-thumbnail entries with their real management links', () => {
    const data = overview({
      popular: [
        {
          imageId: 'recycled-history',
          shortId: 'recycled',
          state: 'recycled',
          count: 12,
          displayName: null,
          managementUrl: '/trash?image=recycled-history',
          thumbnailUrl: null,
        },
        {
          imageId: 'private-history',
          shortId: 'private-',
          state: 'normal',
          count: 11,
          displayName: '已转私有的图片',
          managementUrl: '/library?image=private-history',
          thumbnailUrl: '/api/library/images/private-history/thumbnail',
        },
        {
          imageId: 'disabled-storage-history',
          shortId: 'disabled',
          state: 'normal',
          count: 10,
          displayName: '停用存储图片',
          managementUrl: '/library?image=disabled-storage-history',
          thumbnailUrl: null,
        },
      ],
    });
    const popular = html(AnalyticsPopular, { data, onStatistics: () => {} });
    expect(popular).toContain('已回收图片 · recycled');
    expect(popular).toContain('查看回收站记录');
    expect(popular).toContain(
      'aria-label="查看已回收图片 · recycled统计，12次访问"',
    );
    expect(popular).toContain('已转私有的图片');
    expect(popular).toContain('aria-label="查看已转私有的图片统计，11次访问"');
    expect(popular).toContain('停用存储图片');
    expect(popular).toContain('aria-label="查看停用存储图片统计，10次访问"');
    expect(popular).toContain('无可读缩略图，历史访问保留');
    expect(
      [
        ...popular.matchAll(
          /data-testid="analytics-popular-count"[^>]*>([\d,]+)/g,
        ),
      ].map((match) => match[1]),
    ).toEqual(['12', '11', '10']);
  });
  it('separates a real empty period from a current empty library and never invents popular rows', () => {
    const empty = overview();
    expect(
      html(AnalyticsTrend, { data: empty, dailyUrl: '/analytics?view=daily' }),
    ).toContain('图片库为空，当前周期暂无访问');
    const existing = overview({ counts: { ...empty.counts, normalImages: 5 } });
    expect(
      html(AnalyticsTrend, {
        data: existing,
        dailyUrl: '/analytics?view=daily',
      }),
    ).toContain('本周期暂无公开图片访问');
    expect(
      html(AnalyticsPopular, { data: existing, onStatistics: () => {} }),
    ).toContain('本周期暂无热门图片');
    expect(
      html(AnalyticsPopular, { data: existing, onStatistics: () => {} }),
    ).not.toContain('data-image-id=');
    const versions = html(AnalyticsVersions, { data: existing });
    expect([...versions.matchAll(/<dd[^>]*>0 次<\/dd>/g)]).toHaveLength(3);
    expect(versions).not.toContain('合计 0 次');
  });
  it('does not call an idle process with no committed batch a failure and distinguishes query time from flush time', () => {
    const idle = html(AnalyticsMetadata, { data: overview() });
    expect(idle).toContain('更新于 12:30');
    expect(idle).toContain('aria-label="统计更新时间"');
    expect(idle).not.toContain('本进程尚无已提交的访问批次');
    expect(idle).not.toMatch(/统计写入延迟|已发生访问漏计/);
    const flushed = html(AnalyticsMetadata, {
      data: overview({ lastFlushedAt: '2026-10-09T04:25:00.000Z' }),
    });
    expect(flushed).not.toContain('最近写入于');
    expect(flushed).toContain('aria-label="统计更新时间"');
    expect(flushed).toContain('更新于 12:30');
  });
  it('keeps resource totals and pending bytes on the dashboard, and visits on analytics', () => {
    const data = overview({
      counts: {
        albums: 4,
        normalImages: 12,
        recycledImages: 2,
        initialProcessingFailures: 3,
        reprocessFailures: 1,
      },
      today: 11,
      cumulative: { original: 20, compressed: 30, watermark: 50, total: 100 },
      versions: { original: 1, compressed: 2, watermark: 3, total: 6 },
    });
    const usage: AnalyticsUsage = {
      generatedAt: data.generatedAt,
      scope: 'registered-objects',
      storages: [
        {
          id: 'storage',
          name: '照片归档',
          type: 's3',
          enabled: false,
          knownBytes: 1024,
          groups: { original: 512, derived: 512, recycle: 0, pending: 0 },
          unconfirmedObjects: 2,
          confirmationStatus: 'unconfirmed',
          confirmedAt: null,
        },
      ],
    };
    const query = { data, error: null, isFetching: false, refetch: vi.fn() };
    const dashboard = html(DashboardPanel, {
      overview: query,
      usage: { ...query, data: usage },
      timeZone: data.timezone,
    });
    expect(dashboard).toContain('dashboard-metrics');
    expect(dashboard).toContain('已登记占用');
    expect(dashboard).toContain('1 KiB');
    expect(dashboard).toContain('2 个对象待核对');
    expect(dashboard).toContain('初次处理失败');
    expect(dashboard).toContain('重新处理失败');
    expect(dashboard).toContain('照片归档');
    expect(dashboard).toContain('已停用');
    expect(dashboard).not.toMatch(
      /统计周期|今日访问|累计访问|analytics-trend|analytics-versions|analytics-popular/,
    );
    const analytics = html(AnalyticsOverviewPanel, {
      overview: query,
      days: 7,
      dailyView: false,
      timeZone: data.timezone,
      url: (view: string) => `/analytics?days=7&view=${view}`,
      onDays: vi.fn(),
      onStatistics: vi.fn(),
    });
    expect(analytics).toContain('统计周期');
    expect(analytics).toContain('最近 7 天');
    expect(analytics).toContain('今日访问');
    expect(analytics).toContain('累计访问');
    expect(analytics).toContain('analytics-trend');
    expect(analytics).toContain('analytics-versions');
    expect(analytics).toContain('analytics-popular');
    expect(analytics).not.toMatch(
      /dashboard-metrics|analytics-failures|analytics-usage-summary|照片归档/,
    );
    expect(html(DashboardResources, { data })).toContain('未读取');
    expect(html(UsageSummary, { data: usage })).not.toContain(
      'usage-composition',
    );
  });
  it('shows only real processing failures and a short healthy state', () => {
    const data = overview();
    const healthy = html(AnalyticsFailures, { data });
    expect(healthy).toContain('没有待处理事项');
    expect(healthy).not.toContain('failure=');
    const failed = html(AnalyticsFailures, {
      data: overview({ counts: { ...data.counts, reprocessFailures: 2 } }),
    });
    expect(failed).toContain('2 张');
    expect(failed).toContain('/library?failure=reprocess');
    expect(failed).not.toContain('/library?failure=initial');
  });
  it('keeps the displayed period on charts and links while another period loads or fails', () => {
    const data = overview();
    const url = vi.fn(
      (view: string, days = 30) => `/analytics?days=${days}&view=${view}`,
    );
    const props = {
      overview: {
        data,
        error: null as Error | null,
        isFetching: true,
        refetch: vi.fn(),
      },
      days: 30 as const,
      dailyView: false,
      timeZone: data.timezone,
      url,
      onDays: vi.fn(),
      onStatistics: vi.fn(),
    };
    const reading = html(AnalyticsOverviewPanel, props);
    expect(reading).toContain('正在读取 30 天，暂示 7 天（12:30）');
    expect(reading).toContain('data-requested-days="30"');
    expect(reading).toContain('data-displayed-days="7"');
    expect(reading).toContain('aria-busy="true"');
    expect(reading).toContain('analytics-metrics');
    expect(reading).toContain('版本分布 · 最近 7 天');
    expect(reading).toContain('热门图片 · 最近 7 天');
    expect(reading).toContain('2026-10-03—2026-10-09');
    expect(reading).toContain('/analytics?days=7&amp;view=daily');
    expect(url).toHaveBeenCalledWith('daily', 7);
    expect(reading).not.toContain('overview-loading');
    const failed = html(AnalyticsOverviewPanel, {
      ...props,
      overview: {
        ...props.overview,
        error: new Error('数据库读取失败'),
        isFetching: false,
      },
    });
    expect(failed).toContain('30 天更新失败，当前显示 7 天（12:30）');
    expect(failed).toContain('数据库读取失败');
    expect(failed).toContain('aria-label="重试 30 天访问统计"');
    expect(failed).toContain('overview-stale');
    expect(failed).toContain('analytics-trend');
    expect(failed).not.toContain('overview-error');
    expect([...failed.matchAll(/aria-label="统计周期"/g)]).toHaveLength(1);
    const daily = html(AnalyticsOverviewPanel, {
      ...props,
      dailyView: true,
    });
    expect(daily).toContain('最近 7 天每日访问数值');
    expect(daily).not.toContain('最近 30 天每日访问数值');
  });
  it('keeps one period control on initial overview loading and error without fabricating a report', () => {
    for (const error of [null, new Error('连接中断')]) {
      const markup = html(AnalyticsOverviewPanel, {
        overview: {
          data: undefined,
          error,
          isFetching: !error,
          refetch: vi.fn(),
        },
        days: 90,
        dailyView: false,
        timeZone: 'Asia/Shanghai',
        url: () => '/analytics?days=90',
        onDays: vi.fn(),
        onStatistics: vi.fn(),
      });
      expect([...markup.matchAll(/aria-label="统计周期"/g)]).toHaveLength(1);
      expect(markup).toContain(error ? 'overview-error' : 'overview-loading');
      expect(markup).not.toContain('analytics-overview');
      expect(markup).not.toContain('analytics-metrics');
    }
  });
  it('separates normal waiting, backlog, persistent loss and old-timezone history', () => {
    const base = overview();
    const waiting = html(AnalyticsMetadata, {
      data: overview({
        health: { ...base.health, status: 'waiting', pendingEvents: 2 },
      }),
    });
    expect(waiting).toContain('有访问等待写入');
    expect(waiting).not.toContain('统计写入延迟');
    const backlog = html(AnalyticsMetadata, {
      data: overview({
        health: {
          ...base.health,
          status: 'backlogged',
          lastError: 'write failure',
          pendingEvents: 2,
        },
      }),
    });
    expect(backlog).toContain('统计写入延迟');
    expect(backlog).not.toContain('已发生访问漏计');
    const incomplete = html(AnalyticsMetadata, {
      data: overview({
        health: {
          ...base.health,
          status: 'incomplete',
          incomplete: true,
          dropped: 1,
        },
        containsOldTimezone: true,
      }),
    });
    expect(incomplete).toContain('后续更新不会补回已丢失的访问');
    expect(incomplete).toContain('含按旧时区归档的数据');
    expect(incomplete).not.toContain('写入尚未恢复');
  });
  it('keeps known bytes, unknown objects and disabled storage separate instead of drawing a complete proportion', () => {
    const data: AnalyticsUsage = {
      generatedAt: '2026-10-09T04:30:00.000Z',
      scope: 'registered-objects',
      storages: [
        {
          id: 'storage',
          name: '存储归档',
          type: 's3',
          enabled: false,
          knownBytes: 1024,
          groups: { original: 512, derived: 512, recycle: 0, pending: 0 },
          unconfirmedObjects: 3,
          confirmationStatus: 'unconfirmed',
          confirmedAt: null,
        },
      ],
    };
    const pending = html(UsageContent, { data, timeZone: 'Asia/Shanghai' });
    expect(pending).toContain('已停用');
    expect(pending).toContain('3 个对象待核对');
    expect(pending).toContain('总量待确认');
    expect(pending).toContain('chip--warning');
    expect(pending).toContain('chip--default');
    expect(pending).toContain('bg-foreground/8 text-muted');
    expect(pending).not.toContain('总占用尚未确认，不绘完整比例');
    expect(pending).not.toContain('停用不会清零');
    expect(pending).not.toContain('受理永久删除后仍占空间');
    expect(pending).not.toContain('data-testid="usage-composition"');
    expect(pending).toContain('尚无完整的最后确认时间');
    const confirmed = html(UsageContent, {
      data: {
        ...data,
        storages: [
          {
            ...data.storages[0],
            unconfirmedObjects: 0,
            confirmationStatus: 'confirmed',
          },
        ],
      },
      timeZone: 'Asia/Shanghai',
    });
    expect(confirmed).toContain('data-testid="usage-composition"');
    expect(confirmed).toContain('512 B');
  });
  it.each([true, false])(
    'keeps composition completeness independent of enabled=%s',
    (enabled) => {
      const storage: AnalyticsUsage['storages'][number] = {
        id: 'composition-storage',
        name: '真实存储',
        type: 'local',
        enabled,
        knownBytes: 1024,
        groups: { original: 512, derived: 256, recycle: 256, pending: 0 },
        unconfirmedObjects: 0,
        confirmationStatus: 'confirmed',
        confirmedAt: '2026-10-09T03:20:00.000Z',
      };
      const render = (item: typeof storage) =>
        html(UsageContent, {
          data: {
            generatedAt: '2026-10-09T04:30:00.000Z',
            scope: 'registered-objects',
            storages: [item],
          },
          timeZone: 'Asia/Shanghai',
        });
      const confirmed = render(storage);
      expect(confirmed).toContain('data-slot="chip"');
      expect(confirmed).toContain(enabled ? 'chip--success' : 'chip--default');
      expect(confirmed).toContain(enabled ? '已启用' : '已停用');
      expect(confirmed).toContain('usage-composition');
      expect(confirmed).toContain('已登记 1 KiB');
      expect(confirmed).toContain('最后确认 2026/10/09 11:20');
      expect(confirmed).not.toContain('待核对');
      expect(confirmed).not.toContain('四类互斥，合计');
      const unknown = render({
        ...storage,
        unconfirmedObjects: 2,
        confirmationStatus: 'unconfirmed',
      });
      expect(unknown).toContain('总量待确认');
      expect(unknown).toContain('2 个对象待核对');
      expect(unknown).toContain('512 B');
      expect(unknown).not.toContain('usage-composition');
      const zero = render({
        ...storage,
        knownBytes: 0,
        groups: { original: 0, derived: 0, recycle: 0, pending: 0 },
        confirmedAt: null,
      });
      expect(zero).toContain('已登记 0 B');
      expect(zero).not.toContain('usage-composition');
      expect(zero).not.toContain('待核对');
      expect(zero).toContain('尚无完整的最后确认时间');
    },
  );
});
