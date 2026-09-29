import { parseDate } from '@internationalized/date';
import { LibraryQueryError } from './query-schema.ts';

/** Inclusive calendar dates become a half-open UTC range using the site's IANA zone. */
export function libraryDateRange(
  from: string | undefined,
  through: string | undefined,
  timeZone: string,
) {
  try {
    const start = from === undefined ? undefined : parseDate(from);
    const end = through === undefined ? undefined : parseDate(through);
    if (start && end && start.compare(end) > 0) throw new Error('日期范围倒置');
    return {
      uploadedFrom: start?.toDate(timeZone).toISOString(),
      uploadedBefore: end?.add({ days: 1 }).toDate(timeZone).toISOString(),
    };
  } catch (cause) {
    throw new LibraryQueryError(
      `日期或站点时区无效：${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}
