CREATE TABLE `storage_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`enabled` integer NOT NULL,
	`local_path` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `storage_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`default_storage_id` text,
	FOREIGN KEY (`default_storage_id`) REFERENCES `storage_configs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "storage_settings_singleton" CHECK("storage_settings"."id" = 1)
);
