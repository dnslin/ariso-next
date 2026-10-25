CREATE TABLE `media_edit_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`source_image_id` text NOT NULL,
	`source_object_id` text NOT NULL,
	`mode` text NOT NULL,
	`recipe` text NOT NULL,
	`watermark_asset` text,
	`rendered_object_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `media_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rendered_object_id`) REFERENCES `media_objects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_edit_requests_job` ON `media_edit_requests` (`job_id`);--> statement-breakpoint
CREATE INDEX `media_edit_requests_source` ON `media_edit_requests` (`source_object_id`);--> statement-breakpoint
CREATE INDEX `media_edit_requests_source_image` ON `media_edit_requests` (`source_image_id`);--> statement-breakpoint
CREATE TABLE `media_edit_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`recipe` text NOT NULL,
	`watermark_asset_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`watermark_asset_id`) REFERENCES `media_watermark_assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `media_edit_templates_asset` ON `media_edit_templates` (`watermark_asset_id`);--> statement-breakpoint
ALTER TABLE `media_objects` ADD `content_sha256` text;