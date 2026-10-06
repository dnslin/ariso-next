import type { CalendarDateTime } from '@internationalized/date';

export function tokenExpiresIn(
  value: CalendarDateTime | null,
  timeZone: string,
  now = Date.now(),
) {
  if (!value) throw new Error('请选择到期时间');
  const expiresAt = value.toDate(timeZone).getTime();
  const seconds = (expiresAt - now) / 1000;
  if (!Number.isFinite(expiresAt) || !Number.isFinite(seconds) || seconds < 1)
    throw new Error('到期时间须晚于当前时间至少 1 秒');
  return seconds;
}

export function formatTokenTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}

export function tokenExpired(expiresAt: string | null, now = Date.now()) {
  return expiresAt !== null && now >= new Date(expiresAt).getTime();
}
