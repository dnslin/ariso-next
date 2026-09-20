import { describe, expect, it } from 'vitest';
import {
  publicUrlSchema,
  siteSettingsInputSchema,
  timeZoneSchema,
} from '../../../src/server/site/validation.ts';
import { buildSiteUrl } from '../../../src/server/site/urls.ts';
import { formatSiteInstant } from '../../../src/server/site/time.ts';

describe('site 地址与时区契约', () => {
  it.each([
    [' HTTPS://IMG.Example.COM:443/ ', 'https://img.example.com'],
    ['http://localhost:3000', 'http://localhost:3000'],
    ['http://example.com:80/', 'http://example.com'],
    ['https://example.com:8443/', 'https://example.com:8443'],
    ['http://[::1]:3000/', 'http://[::1]:3000'],
  ])('规范化 %s', (input, expected) => {
    expect(publicUrlSchema.parse(input)).toBe(expected);
  });

  it.each([
    '',
    'example.com',
    'ftp://example.com',
    '//example.com',
    'https:example.com',
    'https:///example.com',
    'https://user:pass@example.com',
    'https://user@example.com',
    'https://@example.com',
    'https://example.com/ariso/',
    'https://example.com/a/..',
    'https://example.com/%2e/',
    'https://example.com/?mode=1',
    'https://example.com/?',
    'https://example.com/#fragment',
    'https://example.com/#',
    'https://example.com\\',
    'https://exa\nmple.com',
  ])('拒绝非法公开地址 %j 并定位字段', (publicUrl) => {
    const result = siteSettingsInputSchema.safeParse({
      publicUrl,
      timeZone: 'UTC',
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].path).toEqual(['publicUrl']);
  });

  it.each([
    'UTC',
    'Asia/Shanghai',
    'America/New_York',
    'US/Eastern',
    'Etc/GMT-8',
  ])('接受 IANA/别名 %s', (value) => {
    expect(timeZoneSchema.parse(value)).toBe(
      new Intl.DateTimeFormat('zh-CN', { timeZone: value }).resolvedOptions()
        .timeZone,
    );
  });

  it.each(['', '+08:00', '-0500', '+08', 'UTC+8', 'Mars/Olympus'])(
    '拒绝时区 %j 并定位字段',
    (timeZone) => {
      const result = siteSettingsInputSchema.safeParse({
        publicUrl: 'https://example.com',
        timeZone,
      });
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues[0].path).toEqual(['timeZone']);
    },
  );

  it('用同一配置生成链接，正确编码查询与重复参数', () => {
    const query = new URLSearchParams([
      ['name', '中文 & ='],
      ['tag', 'a'],
      ['tag', 'b'],
    ]);
    const url = new URL(
      buildSiteUrl({ publicUrl: 'https://example.com:8443' }, '/reset', query),
    );
    expect(url.origin).toBe('https://example.com:8443');
    expect(url.pathname).toBe('/reset');
    expect([...url.searchParams]).toEqual([...query]);
  });

  it.each([
    'https://other.example',
    '//other.example',
    '/\\other.example',
    'relative',
    '/path?x=1',
    '/path#hash',
    '/\n/other.example',
  ])('拒绝非站内路径 %j', (path) => {
    expect(() =>
      buildSiteUrl({ publicUrl: 'https://example.com' }, path),
    ).toThrow('SITE_INVALID_PATH');
  });

  it('按站点时区展示 UTC 时间点，覆盖夏令时跳跃和重复小时', () => {
    const options = {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    } as const;
    const format = (value: string) =>
      formatSiteInstant(new Date(value), 'America/New_York', options);
    expect(format('2026-03-08T06:59:00Z')).toBe('01:59');
    expect(format('2026-03-08T07:00:00Z')).toBe('03:00');
    expect(format('2026-11-01T05:30:00Z')).toBe('01:30');
    expect(format('2026-11-01T06:30:00Z')).toBe('01:30');
    expect(formatSiteInstant(0, 'UTC', options)).toBe('00:00');
    expect(formatSiteInstant(0, 'Asia/Shanghai', options)).toBe('08:00');
    expect(() => formatSiteInstant(NaN, 'UTC')).toThrow(RangeError);
    expect(() => formatSiteInstant(0, 'Mars/Olympus')).toThrow(RangeError);
  });
});
