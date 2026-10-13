import {
  ACCESS_BUFFER_CAPACITY,
  createAccessCollector,
  getAccessCollector,
} from '../../../src/server/analytics/collector.ts';
import { describe, expect, it } from 'vitest';

describe('production in-memory access collector', () => {
  const access = {
    imageId: 'image',
    storageId: 'storage',
    actualVersion: 'original' as const,
    occurredAt: new Date('2026-09-16T16:30:00Z'),
  };

  it('aggregates separate GETs by historical identity, local date, timezone and actual version', () => {
    const collector = createAccessCollector();
    collector.recordAccess(access, 'Asia/Shanghai');
    collector.recordAccess({ ...access, storageId: 'other' }, 'Asia/Shanghai');
    collector.recordAccess(
      { ...access, actualVersion: 'compressed' },
      'Asia/Shanghai',
    );
    collector.recordAccess(
      { ...access, actualVersion: 'watermark' },
      'Asia/Shanghai',
    );
    collector.recordAccess(access, 'America/Los_Angeles');
    expect(collector.snapshot()).toEqual({
      accepted: 5,
      dropped: 0,
      incomplete: false,
      increments: [
        {
          imageId: 'image',
          date: '2026-09-17',
          timezone: 'Asia/Shanghai',
          version: 'original',
          count: 2,
        },
        {
          imageId: 'image',
          date: '2026-09-17',
          timezone: 'Asia/Shanghai',
          version: 'compressed',
          count: 1,
        },
        {
          imageId: 'image',
          date: '2026-09-17',
          timezone: 'Asia/Shanghai',
          version: 'watermark',
          count: 1,
        },
        {
          imageId: 'image',
          date: '2026-09-16',
          timezone: 'America/Los_Angeles',
          version: 'original',
          count: 1,
        },
      ],
    });
  });

  it.each([
    ['2026-03-08T04:59:59Z', '2026-03-07'],
    ['2026-03-08T05:00:00Z', '2026-03-08'],
    ['2026-03-09T03:59:59Z', '2026-03-08'],
    ['2026-03-09T04:00:00Z', '2026-03-09'],
    ['2026-11-01T05:30:00Z', '2026-11-01'],
    ['2026-11-01T06:30:00Z', '2026-11-01'],
  ])('uses calendar dates across DST: %s', (instant, date) => {
    const collector = createAccessCollector();
    collector.recordAccess(
      { ...access, occurredAt: new Date(instant) },
      'America/New_York',
    );
    expect(collector.snapshot().increments[0]?.date).toBe(date);
  });

  it('retains same-date timezone segments and protects stored dates from caller mutation', () => {
    const collector = createAccessCollector();
    const occurredAt = new Date('2026-09-17T12:00:00Z');
    collector.recordAccess({ ...access, occurredAt }, 'UTC');
    collector.recordAccess({ ...access, occurredAt }, 'Asia/Shanghai');
    occurredAt.setUTCFullYear(2000);
    const snapshot = collector.snapshot();
    snapshot.increments[0]!.count = 100;
    expect(
      collector
        .snapshot()
        .increments.map(({ date, count }) => ({ date, count })),
    ).toEqual([
      { date: '2026-09-17', count: 1 },
      { date: '2026-09-17', count: 1 },
    ]);
  });

  it('bounds different keys, keeps accepting existing keys and reports dropped events', () => {
    const collector = createAccessCollector();
    for (let i = 0; i < ACCESS_BUFFER_CAPACITY; i++)
      expect(
        collector.recordAccess({ ...access, imageId: String(i) }, 'UTC'),
      ).toBe(true);
    expect(collector.recordAccess(access, 'UTC')).toBe(false);
    expect(collector.recordAccess({ ...access, imageId: '0' }, 'UTC')).toBe(
      true,
    );
    expect(collector.snapshot()).toMatchObject({
      accepted: 20001,
      dropped: 1,
      incomplete: true,
    });
    expect(collector.snapshot().increments).toHaveLength(20000);
  });

  it('surfaces invalid timezones, dates and unapproved versions without partial increments', () => {
    const collector = createAccessCollector();
    expect(() => collector.recordAccess(access, 'invalid/timezone')).toThrow();
    expect(() =>
      collector.recordAccess({ ...access, occurredAt: new Date(NaN) }, 'UTC'),
    ).toThrow();
    expect(() =>
      collector.recordAccess({ ...access, actualVersion: 'thumbnail' }, 'UTC'),
    ).toThrow('Thumbnail');
    expect(collector.snapshot().accepted).toBe(0);
    expect(collector.recordAccess(access, 'UTC')).toBe(true);
  });

  it('reuses one process collector', () => {
    expect(getAccessCollector()).toBe(getAccessCollector());
  });
});
