import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AnalyticsMetadata,
  AnalyticsMetrics,
} from '../../../src/components/analytics/overview-summary';
import {
  AnalyticsTrend,
  AnalyticsVersions,
} from '../../../src/components/analytics/overview-content';
import { AnalyticsPopular } from '../../../src/components/analytics/popular';
import { UsageContent } from '../../../src/components/analytics/usage-content';
import { AnalyticsLoading } from '../../../src/components/analytics/query-state';
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
      popular: [
        {
          imageId: 'deleted-history',
          shortId: 'deleted-',
          state: 'deleted',
          count: 12,
          displayName: null,
          managementUrl: null,
          thumbnailUrl: null,
        },
      ],
    });
    const metrics = html(AnalyticsMetrics, { data });
    expect(metrics).toContain('1,000');
    const trend = html(AnalyticsTrend, {
      data,
      dailyUrl: '/analytics?days=7&view=daily',
    });
    expect(trend).toContain('12');
    expect(trend).not.toContain('暂无访问');
    const popular = html(AnalyticsPopular, { data });
    expect(popular).toContain('已删除图片');
    expect(popular).toContain('12');
    expect(popular).not.toContain('href=');
    expect(popular).not.toContain('deleted-history?');
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
    expect(html(AnalyticsPopular, { data: existing })).toContain(
      '本周期暂无热门图片',
    );
    expect(html(AnalyticsPopular, { data: existing })).not.toContain(
      'data-image-id=',
    );
    expect(html(AnalyticsVersions, { data: existing })).toContain('合计 0 次');
  });
  it('does not call an idle process with no committed batch a failure and distinguishes query time from flush time', () => {
    const idle = html(AnalyticsMetadata, { data: overview() });
    expect(idle).toContain('2026/10/09 12:30');
    expect(idle).toContain('本进程尚无已提交的访问批次');
    expect(idle).not.toMatch(/统计写入延迟|已发生访问漏计/);
    const flushed = html(AnalyticsMetadata, {
      data: overview({ lastFlushedAt: '2026-10-09T04:25:00.000Z' }),
    });
    expect(flushed).toContain('最近写入于 2026/10/09 12:25');
    expect(flushed).toContain('更新于 2026/10/09 12:30');
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
    expect(pending).toContain('另有 3 个对象待核对');
    expect(pending).toContain('总占用尚未确认，不绘完整比例');
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
});
