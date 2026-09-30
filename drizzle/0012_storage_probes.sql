CREATE TABLE `storage_probes` (
	`id` text PRIMARY KEY NOT NULL,
	`storage_id` text NOT NULL,
	`purpose` text NOT NULL,
	`config_revision` integer NOT NULL,
	`key` text NOT NULL,
	`state` text NOT NULL,
	`stage` text NOT NULL,
	`object_state` text NOT NULL,
	`byte_size` integer,
	`confirmed_at` integer,
	`cleanup_attempts` integer DEFAULT 0 NOT NULL,
	`next_cleanup_at` integer,
	`error` text,
	`report` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`storage_id`) REFERENCES `storage_configs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `storage_probes_storage` ON `storage_probes` (`storage_id`);--> statement-breakpoint
ALTER TABLE `storage_configs` ADD `connection_report` text;