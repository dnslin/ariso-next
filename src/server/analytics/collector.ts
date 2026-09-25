import type { ImageAccessEvent } from '../delivery/response.ts';

export const ACCESS_BUFFER_CAPACITY = 20_000;
export type AccessIncrement = {
  imageId: string;
  date: string;
  timezone: string;
  version: Exclude<ImageAccessEvent['actualVersion'], 'thumbnail'>;
  count: number;
};

/** Delivery owns eligibility and once-per-request delivery; this function only aggregates. */
export function createAccessCollector() {
  const pending = new Map<string, AccessIncrement>();
  let dropped = 0;
  let accepted = 0;
  // Only the latest formatter is cached: changing site settings cannot grow this cache.
  let formatter: Intl.DateTimeFormat | undefined;
  let formatterTimezone: string | undefined;

  return {
    recordAccess(event: ImageAccessEvent, timezone: string): boolean {
      if (event.actualVersion === 'thumbnail')
        throw new Error('Thumbnail is not an approved analytics access event');
      if (formatterTimezone !== timezone) {
        formatter = new Intl.DateTimeFormat('en', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
        formatterTimezone = timezone;
      }
      const parts = formatter!.formatToParts(event.occurredAt);
      const part = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((item) => item.type === type)!.value;
      const date = `${part('year')}-${part('month')}-${part('day')}`;
      const key = JSON.stringify([
        event.imageId,
        date,
        timezone,
        event.actualVersion,
      ]);
      const existing = pending.get(key);
      if (existing) existing.count++;
      else if (pending.size < ACCESS_BUFFER_CAPACITY) {
        pending.set(key, {
          imageId: event.imageId,
          date,
          timezone,
          version: event.actualVersion,
          count: 1,
        });
      } else {
        dropped++;
        return false;
      }
      accepted++;
      return true;
    },
    snapshot() {
      return {
        increments: Array.from(pending.values(), (increment) => ({
          ...increment,
        })),
        accepted,
        dropped,
        incomplete: dropped > 0,
      };
    },
  };
}

const processState = globalThis as typeof globalThis & {
  arisoAccessCollector?: ReturnType<typeof createAccessCollector>;
};

/** One in-memory collector per Web process, including development hot reloads. */
export function getAccessCollector() {
  return (processState.arisoAccessCollector ??= createAccessCollector());
}
