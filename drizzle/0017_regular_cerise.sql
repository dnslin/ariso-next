CREATE TABLE `media_cleanup_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`image_id` text NOT NULL,
	`status` text NOT NULL,
	`cycle` integer DEFAULT 1 NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_cleanup_jobs_image_id_unique` ON `media_cleanup_jobs` (`image_id`);--> statement-breakpoint
ALTER TABLE `media_objects` ADD `cleanup_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `media_objects` ADD `next_cleanup_at` integer;