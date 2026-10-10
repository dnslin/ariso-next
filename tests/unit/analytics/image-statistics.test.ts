import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ImageStatisticsContent } from '../../../src/components/analytics/image-statistics-content';
import { RollingNumber } from '../../../src/components/analytics/rolling-number';
import {
  AnalyticsReadError,
  type AnalyticsImageStats,
} from '../../../src/components/analytics/read-analytics';

function stats(
  overrides: Partial<AnalyticsImageStats> = {},
): AnalyticsImageStats {
  return {
    imageId: 'b66a53ed-debb-4468-bd53-65d14ce45040',
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
    cumulative: { original: 862, compressed: 284, watermark: 102, total: 1248 },
    periods: [
      {
        days: 7,
        startDate: '2026-10-03',
        endDate: '2026-10-09',
        total: 186,
        containsOldTimezone: false,
      },
      {
        days: 30,
        startDate: '2026-09-10',
        endDate: '2026-10-09',
        total: 624,
        containsOldTimezone: false,
      },
      {
        days: 90,
        startDate: '2026-07-12',
        endDate: '2026-10-09',
        total: 1032,
        containsOldTimezone: false,
      },
    ],
    ...overrides,
  };
}

function render(
  overrides: Partial<Parameters<typeof ImageStatisticsContent>[0]> = {},
) {
  return renderToStaticMarkup(
    createElement(ImageStatisticsContent, {
      error: null,
      pending: false,
      fetching: false,
      onRetry: vi.fn(),
      onClose: vi.fn(),
      returnLabel: '返回排行',
      ...overrides,
    }),
  );
}

describe('single image statistics presentation', () => {
  it('uses actual cumulative version counts and the three overlapping window totals', () => {
    const html = render({ data: stats() });
    for (const count of [862, 284, 102])
      expect(html).toContain(`${count}<small`);
    expect(html).toContain('scaleX(1)');
    expect(html).toContain(`scaleX(${284 / 862})`);
    expect(html).toContain(
      'aria-label="近7天 186次，近30天 624次，近90天 1,032次"',
    );
    expect(html).not.toContain('image-statistics-zero');
    expect(html).not.toContain('image-statistics-stale');
    expect(html).not.toContain('image-statistics-waiting');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('查看数值与范围');
  });

  it('does not turn first loading or a first read failure into successful zero statistics', () => {
    const loading = render({ pending: true, fetching: true });
    expect(loading).toContain('正在读取统计');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).not.toContain('image-statistics-versions');
    const failed = render({ error: new Error('真实读取故障') });
    expect(failed).toContain('统计暂时无法读取');
    expect(failed).toContain('真实读取故障');
    expect(failed).toContain('重试统计');
    expect(failed).not.toContain('image-statistics-zero');
    expect(failed).not.toContain('image-statistics-chart');
  });

  it('preserves old same-image numbers on a refresh failure and offers a real retry control', () => {
    const html = render({
      data: stats(),
      error: new AnalyticsReadError('服务器故障', 500, 'READ_FAILED'),
    });
    expect(html).toContain('刷新失败 · 保留上次统计');
    expect(html).toContain('aria-label="重试统计"');
    expect(html).toContain('近90天 1,032次');
    expect(html).toContain('862<small');
    expect(html).not.toContain('统计暂时无法读取');
  });

  it.each([401, 404])(
    'hides old statistics after HTTP %s instead of presenting them as stale',
    (status) => {
      const html = render({
        data: stats(),
        error: new AnalyticsReadError('unavailable', status, 'UNAVAILABLE'),
      });
      expect(html).toContain(
        status === 404 ? '图片记录已不存在' : '登录已失效',
      );
      expect(html).not.toContain('image-statistics-versions');
      expect(html).not.toContain('image-statistics-chart');
      expect(html).not.toContain('862<small');
      expect(html).not.toContain('重试统计');
      if (status === 404) expect(html).toContain('返回排行');
    },
  );

  it('shows genuine zero counts without an invalid proportional bar or a read error', () => {
    const data = stats();
    data.cumulative = { original: 0, compressed: 0, watermark: 0, total: 0 };
    data.periods = data.periods.map((period) => ({ ...period, total: 0 }));
    const html = render({ data });
    expect(html).toContain('暂无公开访问');
    expect(html).toContain('近7天 0次，近30天 0次，近90天 0次');
    expect(html.match(/scaleX\(0\)/g)).toHaveLength(3);
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
    expect(html).not.toContain('尚未取得');
  });

  it('reports actual waiting, backlog, persistent loss and old-timezone segments independently', () => {
    const data = stats();
    expect(render({ data })).not.toContain('image-statistics-backlogged');
    data.health.status = 'waiting';
    expect(render({ data })).toContain('有访问等待写入');
    data.health.status = 'backlogged';
    data.health.incomplete = true;
    data.periods[2].containsOldTimezone = true;
    let html = render({ data });
    expect(html).toContain('写入延迟 · 部分访问尚未计入');
    expect(html).toContain('已丢失的访问不会补回');
    expect(html).toContain('含按旧时区归档的数据');
    data.health.status = 'idle';
    html = render({ data });
    expect(html).not.toContain('写入延迟');
    expect(html).toContain('已丢失的访问不会补回');
  });
});

describe('rolling cumulative number', () => {
  it.each([0, 1248, 1200400])(
    'announces %s once while hiding wheel digits from assistive reading',
    (value) => {
      const html = renderToStaticMarkup(
        createElement(RollingNumber, { value }),
      );
      expect(html).toContain(
        `role="img" aria-label="${value.toLocaleString('zh-CN')}"`,
      );
      expect(html).toContain('aria-hidden="true"');
      expect(html.match(/data-testid="rolling-number-wheel"/g)).toHaveLength(
        String(value).length,
      );
      expect(html).toContain('duration-[280ms]');
      expect(html).toContain('motion-reduce:transition-none');
    },
  );
});
