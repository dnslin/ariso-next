import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

export type CollectionsTransaction = Parameters<
  Parameters<BetterSQLite3Database['transaction']>[0]
>[0];

export type CollectionSelection = {
  readonly albumIds: readonly string[];
  readonly tagIds: readonly string[];
};
