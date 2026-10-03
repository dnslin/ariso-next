CREATE TABLE `storage_orphans` (
	`storage_id` text NOT NULL,
	`key` text NOT NULL,
	`size` integer NOT NULL,
	`confirmed_at` integer NOT NULL,
	`error` text,
	PRIMARY KEY(`storage_id`, `key`),
	FOREIGN KEY (`storage_id`) REFERENCES `storage_configs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `storage_scans` (
	`storage_id` text PRIMARY KEY NOT NULL,
	`config_revision` integer NOT NULL,
	`scope` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text NOT NULL,
	`discovered_count` integer DEFAULT 0 NOT NULL,
	`deleted_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`protected_count` integer DEFAULT 0 NOT NULL,
	`error` text,
	FOREIGN KEY (`storage_id`) REFERENCES `storage_configs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `upload_sessions_temporary_key` ON `upload_sessions` (`storage_id`,`temporary_key`);--> statement-breakpoint
CREATE INDEX `upload_sessions_final_key` ON `upload_sessions` (`storage_id`,`final_key`);