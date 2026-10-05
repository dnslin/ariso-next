import { describe, expect, it } from 'vitest';
import {
  createShareInputSchema,
  parseShareExpiry,
  passwordInputSchema,
  unlockInputSchema,
  updateShareInputSchema,
} from '../../../src/server/sharing/validation.ts';

describe('分享配置输入与站点时间', () => {
  it('密码按 Unicode 码点计数，保留大小写与首尾空格', () => {
    expect(passwordInputSchema.parse(' Ａbc ')).toBe(' Ａbc ');
    expect(passwordInputSchema.parse('😀'.repeat(128))).toHaveLength(256);
    expect(passwordInputSchema.safeParse('').success).toBe(false);
    expect(passwordInputSchema.safeParse('😀'.repeat(129)).success).toBe(false);
    expect(unlockInputSchema.parse({ password: ' ' })).toEqual({
      password: ' ',
    });
  });

  it('显式区分密码保留、设置和清除，不接受原始密码或多余字段', () => {
    for (const password of [
      { action: 'keep' },
      { action: 'set', value: '新密码' },
      { action: 'clear' },
    ]) {
      expect(updateShareInputSchema.parse({ password })).toEqual({ password });
    }
    for (const password of [
      '',
      null,
      { action: 'set', value: '' },
      { action: 'clear', value: 'x' },
    ]) {
      expect(updateShareInputSchema.safeParse({ password }).success).toBe(
        false,
      );
    }
    expect(createShareInputSchema.parse({})).toEqual({});
    expect(createShareInputSchema.safeParse({ enabled: false }).success).toBe(
      false,
    );
    expect(updateShareInputSchema.safeParse({}).success).toBe(false);
    expect(
      updateShareInputSchema.safeParse({ token: 'override' }).success,
    ).toBe(false);
  });

  it('期限协议只接受明确的 UTC ISO 时刻或清除，不接受本地模糊字符串', () => {
    expect(updateShareInputSchema.parse({ expiresAt: null })).toEqual({
      expiresAt: null,
    });
    expect(
      updateShareInputSchema.parse({ expiresAt: '2026-10-05T12:00:00.001Z' }),
    ).toEqual({ expiresAt: '2026-10-05T12:00:00.001Z' });
    for (const expiresAt of [
      '2026-10-05T12:00',
      '2026-10-05T12:00:00+08:00',
      '',
      '2026-02-30T12:00:00Z',
      0,
    ]) {
      expect(updateShareInputSchema.safeParse({ expiresAt }).success).toBe(
        false,
      );
    }
  });

  it('按站点时区转换本地输入，UTC 与上海得到不同绝对时刻', () => {
    expect(parseShareExpiry('2026-10-05T12:00', 'UTC')).toBe(
      '2026-10-05T12:00:00.000Z',
    );
    expect(parseShareExpiry('2026-10-05T12:00', 'Asia/Shanghai')).toBe(
      '2026-10-05T04:00:00.000Z',
    );
    expect(() => parseShareExpiry('2026-02-30T12:00', 'UTC')).toThrowError(
      expect.objectContaining({ code: 'SHARING_INVALID_INPUT' }),
    );
    expect(() => parseShareExpiry('2026-10-00T12:00', 'UTC')).toThrowError(
      expect.objectContaining({ code: 'SHARING_INVALID_INPUT' }),
    );
    expect(() => parseShareExpiry('2026-10-05', 'UTC')).toThrowError(
      expect.objectContaining({ code: 'SHARING_INVALID_INPUT' }),
    );
    expect(() =>
      parseShareExpiry('2026-10-05T12:00', 'Mars/Olympus'),
    ).toThrowError(expect.objectContaining({ code: 'SHARING_INVALID_INPUT' }));
  });

  it('默认拒绝夏令时缺失和重复小时，明确选择可得到两个重复时刻', () => {
    expect(() =>
      parseShareExpiry('2026-03-08T02:30', 'America/New_York'),
    ).toThrowError(expect.objectContaining({ code: 'SHARING_INVALID_INPUT' }));
    expect(() =>
      parseShareExpiry('2026-11-01T01:30', 'America/New_York'),
    ).toThrowError(expect.objectContaining({ code: 'SHARING_INVALID_INPUT' }));
    expect(
      parseShareExpiry('2026-11-01T01:30', 'America/New_York', 'earlier'),
    ).toBe('2026-11-01T05:30:00.000Z');
    expect(
      parseShareExpiry('2026-11-01T01:30', 'America/New_York', 'later'),
    ).toBe('2026-11-01T06:30:00.000Z');
    expect(parseShareExpiry('2026-03-08T01:59', 'America/New_York')).toBe(
      '2026-03-08T06:59:00.000Z',
    );
    expect(parseShareExpiry('2026-03-08T03:00', 'America/New_York')).toBe(
      '2026-03-08T07:00:00.000Z',
    );
  });
});
