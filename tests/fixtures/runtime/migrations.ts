import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Current SQL is required by Web startup. Keep fixture fault timestamps >=1000. */
export function readProductionMigrations() {
  const folder = fileURLToPath(new URL('../../../drizzle/', import.meta.url));
  const journal = JSON.parse(
    readFileSync(join(folder, 'meta/_journal.json'), 'utf8'),
  ) as { entries: { tag: string }[] };
  return journal.entries.map(({ tag }, index) => ({
    tag,
    when: index + 1,
    sql: readFileSync(join(folder, `${tag}.sql`), 'utf8'),
  }));
}

export const initialMigration = {
  tag: '0000_initial',
  when: 1000,
  sql: "CREATE TABLE sample (value TEXT NOT NULL);\n--> statement-breakpoint\nINSERT INTO sample VALUES ('original');",
};
export const upgradeMigration = {
  tag: '0001_upgrade',
  when: 2000,
  sql: "INSERT INTO sample VALUES ('upgrade');",
};
export const brokenMigration = {
  tag: '0002_broken',
  when: 3000,
  sql: 'CREATE TABLE rolled_back (id INTEGER);\n--> statement-breakpoint\nINSERT INTO missing_table VALUES (1);',
};

export function writeMigrations(
  folder: string,
  migrations: { tag: string; when: number; sql: string }[],
) {
  mkdirSync(join(folder, 'meta'), { recursive: true });
  writeFileSync(
    join(folder, 'meta/_journal.json'),
    JSON.stringify({
      version: '7',
      dialect: 'sqlite',
      entries: migrations.map(({ tag, when }, idx) => ({
        idx,
        version: '6',
        when,
        tag,
        breakpoints: true,
      })),
    }),
  );
  for (const migration of migrations) {
    writeFileSync(join(folder, `${migration.tag}.sql`), migration.sql);
  }
  return folder;
}
