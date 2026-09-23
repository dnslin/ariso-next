import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';
import { mediaImages } from '../media/schema.ts';

export const albums = sqliteTable('albums', {
  id: text('id').primaryKey().notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  preferredCoverImageId: text('preferred_cover_image_id').references(
    () => mediaImages.id,
    { onDelete: 'set null' },
  ),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const albumImages = sqliteTable(
  'album_images',
  {
    albumId: text('album_id')
      .notNull()
      .references(() => albums.id, { onDelete: 'cascade' }),
    imageId: text('image_id')
      .notNull()
      .references(() => mediaImages.id, { onDelete: 'cascade' }),
    joinedAt: integer('joined_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.albumId, t.imageId] }),
    index('album_images_album_joined_image').on(
      t.albumId,
      sql`${t.joinedAt} desc`,
      t.imageId,
    ),
    index('album_images_image').on(t.imageId),
  ],
);

export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey().notNull(),
    displayName: text('display_name').notNull(),
    normalizedKey: text('normalized_key').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [unique('tags_normalized_key').on(t.normalizedKey)],
);

export const imageTags = sqliteTable(
  'image_tags',
  {
    imageId: text('image_id')
      .notNull()
      .references(() => mediaImages.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.imageId, t.tagId] }),
    index('image_tags_tag_image').on(t.tagId, t.imageId),
  ],
);
