CREATE TABLE `upload_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`queue_item_id` text NOT NULL,
	`group_index` integer NOT NULL,
	`original_name` text NOT NULL,
	`declared_size` integer NOT NULL,
	`declared_mime` text,
	`storage_id` text NOT NULL,
	`state` text NOT NULL,
	`candidate_image_id` text NOT NULL,
	`temporary_key` text,
	`final_key` text,
	`byte_size` integer,
	`image_id` text,
	`job_id` text,
	`error_code` text,
	`error` text,
	`cleanup_status` text DEFAULT 'none' NOT NULL,
	`cleanup_attempts` integer DEFAULT 0 NOT NULL,
	`next_cleanup_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `upload_submissions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`storage_id`) REFERENCES `storage_configs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "upload_sessions_state" CHECK("upload_sessions"."state" in ('queued', 'receiving', 'validating', 'finalizing', 'accepted', 'cancelled', 'failed', 'expired'))
);
--> statement-breakpoint
CREATE INDEX `upload_sessions_cleanup` ON `upload_sessions` (`cleanup_status`,`next_cleanup_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `upload_sessions_queue_item` ON `upload_sessions` (`submission_id`,`queue_item_id`);--> statement-breakpoint
CREATE TABLE `upload_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`max_file_bytes` integer NOT NULL,
	`batch_size` integer NOT NULL,
	`queue_limit` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "upload_settings_singleton" CHECK("upload_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `upload_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`request_input` text NOT NULL,
	`source` text NOT NULL,
	`storage_id` text NOT NULL,
	`visibility` text NOT NULL,
	`snapshot` text NOT NULL,
	`album_ids` text NOT NULL,
	`tag_ids` text NOT NULL,
	`max_file_bytes` integer NOT NULL,
	`batch_size` integer NOT NULL,
	`queue_limit` integer NOT NULL,
	`last_activity_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`storage_id`) REFERENCES `storage_configs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `upload_submissions_request_id_unique` ON `upload_submissions` (`request_id`);--> statement-breakpoint
INSERT INTO `upload_settings` (`id`, `max_file_bytes`, `batch_size`, `queue_limit`, `updated_at`) VALUES (1, 52428800, 20, 500, CAST(unixepoch('subsec') * 1000 AS INTEGER));
