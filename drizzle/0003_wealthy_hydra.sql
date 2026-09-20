CREATE TABLE `media_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`compression_enabled` integer NOT NULL,
	`output_format` text NOT NULL,
	`quality` integer NOT NULL,
	`max_edge` integer,
	`jpeg_background` text NOT NULL,
	`watermark_mode` text NOT NULL,
	`default_link_version` text NOT NULL,
	`default_visibility` text NOT NULL,
	`concurrency` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "media_settings_singleton" CHECK("media_settings"."id" = 1)
);
