import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

export type SharingTransaction = Parameters<
  Parameters<BetterSQLite3Database['transaction']>[0]
>[0];
