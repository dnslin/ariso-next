PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_upload_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text,
	`queue_item_id` text NOT NULL,
	`group_index` integer NOT NULL,
	`original_name` text NOT NULL,
	`declared_size` integer NOT NULL,
	`declared_mime` text,
	`storage_id` text,
	`state` text NOT NULL,
	`candidate_image_id` text NOT NULL,
	`candidate_job_id` text,
	`route` text,
	`route_reason` text,
	`temporary_path` text,
	`signature_expires_at` integer,
	`source_etag` text,
	`temporary_bytes` integer,
	`final_bytes` integer,
	`confirmed_at` integer,
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
	CONSTRAINT "upload_sessions_state" CHECK("__new_upload_sessions"."state" in ('queued', 'receiving', 'validating', 'finalizing', 'accepted', 'cancelled', 'failed', 'expired'))
);
--> statement-breakpoint
INSERT INTO `__new_upload_sessions`("id", "submission_id", "queue_item_id", "group_index", "original_name", "declared_size", "declared_mime", "storage_id", "state", "candidate_image_id", "candidate_job_id", "route", "route_reason", "temporary_path", "signature_expires_at", "source_etag", "temporary_bytes", "final_bytes", "confirmed_at", "temporary_key", "final_key", "byte_size", "image_id", "job_id", "error_code", "error", "cleanup_status", "cleanup_attempts", "next_cleanup_at", "created_at", "updated_at") SELECT "id", "submission_id", "queue_item_id", "group_index", "original_name", "declared_size", "declared_mime", "storage_id", "state", "candidate_image_id", "candidate_job_id", "route", "route_reason", "temporary_path", "signature_expires_at", "source_etag", "temporary_bytes", "final_bytes", "confirmed_at", "temporary_key", "final_key", "byte_size", "image_id", "job_id", "error_code", "error", "cleanup_status", "cleanup_attempts", "next_cleanup_at", "created_at", "updated_at" FROM `upload_sessions`;--> statement-breakpoint
DROP TABLE `upload_sessions`;--> statement-breakpoint
ALTER TABLE `__new_upload_sessions` RENAME TO `upload_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `upload_sessions_cleanup` ON `upload_sessions` (`cleanup_status`,`next_cleanup_at`);--> statement-breakpoint
CREATE INDEX `upload_sessions_temporary_key` ON `upload_sessions` (`storage_id`,`temporary_key`);--> statement-breakpoint
CREATE INDEX `upload_sessions_final_key` ON `upload_sessions` (`storage_id`,`final_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `upload_sessions_queue_item` ON `upload_sessions` (`submission_id`,`queue_item_id`);--> statement-breakpoint
ALTER TABLE `media_jobs` ADD `metadata_warning` text;--> statement-breakpoint
ALTER TABLE `upload_submissions` ADD `api_token_id` text;