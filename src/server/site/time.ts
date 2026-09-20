/** Date 与 Unix 毫秒均为明确时间点；不接收缺少时区的日期字符串。 */
export function formatSiteInstant(
  instant: Date | number,
  timeZone: string,
  options: Omit<Intl.DateTimeFormatOptions, 'timeZone'> = {},
) {
  return new Intl.DateTimeFormat('zh-CN', {
    ...options,
    timeZone,
  }).format(instant);
}
