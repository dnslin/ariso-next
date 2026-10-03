CREATE TABLE `media_previews` (
	`id` text PRIMARY KEY NOT NULL,
	`target` text,
	`snapshot` text,
	`status` text NOT NULL,
	`result` text,
	`unavailable_reason` text,
	`error` text,
	`cleanup_status` text NOT NULL,
	`cleanup_error` text,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	`expires_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `media_previews_status_created` ON `media_previews` (`status`,`created_at`);