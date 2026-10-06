import {
  fromDate,
  toCalendarDateTime,
  toZoned,
  type CalendarDateTime,
} from '@internationalized/date';
import { parseShareExpiry } from '../../server/sharing/validation';
import type { Share } from './api';

export type ExpiryDraft = {
  mode: 'forever' | 'date';
  value: CalendarDateTime | null;
  disambiguation: 'reject' | 'earlier' | 'later';
};
export type ExpectedFields = Partial<
  Pick<Share, 'enabled' | 'expiresAt' | 'layout' | 'showName' | 'hasPassword'>
>;
export type PendingResult =
  | { kind: 'password' }
  | { kind: 'rotate'; previousToken: string }
  | { kind: 'create' }
  | { kind: 'patch'; expected: ExpectedFields };

export function expiryDraft(
  expiresAt: string | null,
  timeZone: string,
): ExpiryDraft {
  return {
    mode: expiresAt ? 'date' : 'forever',
    value: toCalendarDateTime(
      fromDate(
        expiresAt ? new Date(expiresAt) : new Date(Date.now() + 7 * 86400000),
        timeZone,
      ),
    ),
    disambiguation: 'reject',
  };
}
export function expiryAmbiguity(
  value: CalendarDateTime | null,
  timeZone: string,
) {
  if (!value) return false;
  const earlier = toZoned(value, timeZone, 'earlier');
  const later = toZoned(value, timeZone, 'later');
  return (
    earlier.compare(later) !== 0 &&
    toCalendarDateTime(earlier).compare(value) === 0 &&
    toCalendarDateTime(later).compare(value) === 0
  );
}
export function expiryChanged(
  draft: ExpiryDraft,
  saved: string | null,
  timeZone: string,
) {
  if (draft.mode !== (saved ? 'date' : 'forever')) return true;
  if (draft.mode === 'forever') return false;
  if (
    draft.value?.toString() !== expiryDraft(saved, timeZone).value?.toString()
  )
    return true;
  return (
    draft.disambiguation !== 'reject' &&
    Boolean(draft.value) &&
    parseShareExpiry(
      draft.value!.toString(),
      timeZone,
      draft.disambiguation,
    ) !== saved
  );
}
export function expiryPayload(
  draft: ExpiryDraft,
  timeZone: string,
  now = Date.now(),
) {
  if (draft.mode === 'forever') return null;
  if (!draft.value) throw new Error('请选择截止时间。');
  // A nonexistent local time must remain invalid even when an overlap choice was made.
  const earlier = toZoned(draft.value, timeZone, 'earlier');
  if (
    toCalendarDateTime(earlier).compare(draft.value) !== 0 &&
    !expiryAmbiguity(draft.value, timeZone)
  )
    throw new Error('此时间因夏令时调整不存在，请选择其他时间。');
  const result = parseShareExpiry(
    draft.value.toString(),
    timeZone,
    draft.disambiguation,
  );
  if (new Date(result).getTime() <= now)
    throw new Error('请选择晚于当前时间的截止时间。');
  return result;
}
export function reconcileResult(pending: PendingResult, share: Share | null) {
  if (!share)
    return { confirmed: false, title: '当前没有分享记录，本次结果无法确认' };
  if (pending.kind === 'password')
    return {
      confirmed: false,
      title: `当前${share.hasPassword ? '已设置' : '未设置'}访问密码，新密码无法确认`,
    };
  if (pending.kind === 'create')
    return { confirmed: true, title: '已读取分享设置' };
  if (pending.kind === 'rotate')
    return {
      confirmed: share.token !== pending.previousToken,
      title:
        share.token !== pending.previousToken
          ? '分享地址已重新生成'
          : '当前地址未变化，本次结果无法确认',
    };
  const confirmed = Object.entries(pending.expected).every(
    ([key, value]) => share[key as keyof ExpectedFields] === value,
  );
  return {
    confirmed,
    title: confirmed
      ? '已核对当前设置'
      : '当前设置与本次目标不同，结果无法确认',
  };
}
export function displayPatch(
  share: Share,
  layout: Share['layout'],
  showName: boolean,
) {
  return {
    ...(layout !== share.layout ? { layout } : {}),
    ...(showName !== share.showName ? { showName } : {}),
  };
}
