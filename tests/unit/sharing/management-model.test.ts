import { describe, expect, it } from 'vitest';
import { parseDateTime } from '@internationalized/date';
import {
  displayPatch,
  expiryAmbiguity,
  expiryChanged,
  expiryDraft,
  expiryPayload,
  reconcileResult,
} from '../../../src/app/shares/model';
import type { Share } from '../../../src/app/shares/api';
const share: Share = {
  id: 's',
  albumId: 'a',
  albumName: 'album',
  token: 'old',
  url: 'https://example.com/s/old',
  enabled: true,
  hasPassword: true,
  expiresAt: null,
  layout: 'grid',
  showName: false,
  state: 'enabled',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};
describe('sharing management observable decisions', () => {
  it('never proves an unknown replacement password from its presence', () => {
    expect(reconcileResult({ kind: 'password' }, share)).toMatchObject({
      confirmed: false,
    });
    expect(
      reconcileResult({ kind: 'password' }, { ...share, hasPassword: false }),
    ).toMatchObject({ confirmed: false });
  });
  it('confirms rotation only from changed token', () => {
    expect(
      reconcileResult({ kind: 'rotate', previousToken: 'old' }, share)
        .confirmed,
    ).toBe(false);
    expect(
      reconcileResult(
        { kind: 'rotate', previousToken: 'old' },
        { ...share, token: 'new' },
      ).confirmed,
    ).toBe(true);
  });
  it('reads an existing creation without claiming that requested settings were applied', () => {
    expect(reconcileResult({ kind: 'create' }, share)).toEqual({
      confirmed: true,
      title: '已读取分享设置',
    });
    expect(reconcileResult({ kind: 'create' }, null).confirmed).toBe(false);
  });
  it('compares only submitted fields, preserving an independent writer', () => {
    expect(
      reconcileResult(
        { kind: 'patch', expected: { layout: 'masonry' } },
        { ...share, layout: 'masonry', showName: true },
      ).confirmed,
    ).toBe(true);
    expect(
      reconcileResult(
        { kind: 'patch', expected: { enabled: true, expiresAt: null } },
        { ...share, expiresAt: '2026-09-01T00:00:00.000Z' },
      ).confirmed,
    ).toBe(false);
    expect(displayPatch(share, 'masonry', false)).toEqual({
      layout: 'masonry',
    });
    expect(displayPatch(share, 'grid', true)).toEqual({ showName: true });
  });
  it('converts the site clock to UTC and round trips a saved instant', () => {
    const draft = {
      mode: 'date',
      value: parseDateTime('2026-11-01T23:59'),
      disambiguation: 'reject',
    } as const;
    expect(expiryPayload(draft, 'Asia/Shanghai', 0)).toBe(
      '2026-11-01T15:59:00.000Z',
    );
    expect(
      expiryDraft(
        '2026-11-01T15:59:00.000Z',
        'Asia/Shanghai',
      ).value?.toString(),
    ).toBe('2026-11-01T23:59:00');
  });
  it('requires an explicit choice for a repeated DST clock time', () => {
    const draft = {
      mode: 'date',
      value: parseDateTime('2026-11-01T01:30'),
      disambiguation: 'reject',
    } as const;
    expect(expiryAmbiguity(draft.value, 'America/New_York')).toBe(true);
    expect(() => expiryPayload(draft, 'America/New_York', 0)).toThrow();
    expect(
      expiryPayload(
        { ...draft, disambiguation: 'earlier' },
        'America/New_York',
        0,
      ),
    ).toBe('2026-11-01T05:30:00.000Z');
    expect(
      expiryPayload(
        { ...draft, disambiguation: 'later' },
        'America/New_York',
        0,
      ),
    ).toBe('2026-11-01T06:30:00.000Z');
    expect(
      expiryChanged(
        { ...draft, disambiguation: 'earlier' },
        '2026-11-01T05:30:00.000Z',
        'America/New_York',
      ),
    ).toBe(false);
    expect(
      expiryChanged(
        { ...draft, disambiguation: 'later' },
        '2026-11-01T05:30:00.000Z',
        'America/New_York',
      ),
    ).toBe(true);
  });
  it('rejects a missing DST hour even with an overlap choice', () => {
    const draft = {
      mode: 'date',
      value: parseDateTime('2027-03-14T02:30'),
      disambiguation: 'later',
    } as const;
    expect(expiryAmbiguity(draft.value, 'America/New_York')).toBe(false);
    expect(() => expiryPayload(draft, 'America/New_York', 0)).toThrow('不存在');
  });
  it('allows explicit no expiry but rejects an empty or elapsed deadline', () => {
    expect(
      expiryPayload(
        { mode: 'forever', value: null, disambiguation: 'reject' },
        'Asia/Shanghai',
      ),
    ).toBeNull();
    expect(() =>
      expiryPayload(
        { mode: 'date', value: null, disambiguation: 'reject' },
        'Asia/Shanghai',
      ),
    ).toThrow('请选择');
    expect(() =>
      expiryPayload(
        {
          mode: 'date',
          value: parseDateTime('2026-10-01T00:00'),
          disambiguation: 'reject',
        },
        'Asia/Shanghai',
      ),
    ).toThrow('晚于');
  });
});
