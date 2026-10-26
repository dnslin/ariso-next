import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createProductionFixture } from '../../experiments/library/production-fixture.ts';
import { tags } from '../../../src/server/collections/schema.ts';
import { mediaImages } from '../../../src/server/media/schema.ts';
import {
  createSmartCollection,
  updateSmartCollection,
  readSmartCollection,
  listSmartCollections,
  deleteSmartCollection,
} from '../../../src/server/library/smart-collections.ts';

let directory: string;
let connection: ReturnType<typeof createProductionFixture>;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-smart-'));
  connection = createProductionFixture(join(directory, 'ariso.db'), 1);
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});

it('persists named rules, changes their name without replacing rules, and deletes only the definition', () => {
  const created = createSmartCollection(connection.db, {
    name: '  待整理  ',
    rules: { tagState: 'none' },
  });
  expect(created.name).toBe('待整理');
  expect(listSmartCollections(connection.db).map((item) => item.id)).toEqual([
    created.id,
  ]);
  const renamed = updateSmartCollection(connection.db, created.id, {
    name: '无标签',
  });
  expect(renamed.rules).toEqual(created.rules);
  expect(readSmartCollection(connection.db, created.id).name).toBe('无标签');
  deleteSmartCollection(connection.db, created.id);
  expect(listSmartCollections(connection.db)).toEqual([]);
  expect(connection.db.select().from(mediaImages).all()).toHaveLength(1);
  expect(() => readSmartCollection(connection.db, created.id)).toThrow(
    '集合不存在',
  );
});

it('keeps deleted target IDs in saved rules for repair and never binds a same-name replacement', () => {
  const collection = createSmartCollection(connection.db, {
    name: '截图',
    rules: { tagId: ['tag-1'], recentDays: '7' },
  });
  connection.db.delete(tags).where(eq(tags.id, 'tag-1')).run();
  expect(readSmartCollection(connection.db, collection.id).rules.tagId).toEqual(
    ['tag-1'],
  );
  expect(() =>
    updateSmartCollection(connection.db, collection.id, {
      rules: collection.rules,
    }),
  ).toThrow('筛选引用已失效');
  expect(
    updateSmartCollection(connection.db, collection.id, { name: '需要修复' })
      .rules.tagId,
  ).toEqual(['tag-1']);
  expect(
    updateSmartCollection(connection.db, collection.id, {
      rules: { recentDays: '7' },
    }).rules,
  ).not.toHaveProperty('tagId');
});
