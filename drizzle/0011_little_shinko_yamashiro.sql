CREATE TABLE `media_watermark_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`format` text,
	`mime` text,
	`width` integer,
	`height` integer,
	`byte_size` integer NOT NULL,
	`status` text NOT NULL,
	`expires_at` integer,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_watermark_assets_path_unique` ON `media_watermark_assets` (`path`);--> statement-breakpoint
CREATE TABLE `media_watermark_preview_refs` (
	`preview_id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `media_watermark_assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `media_settings` ADD `watermark_asset_id` text REFERENCES media_watermark_assets(id);