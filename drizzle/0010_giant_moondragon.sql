-- Preserve parent-table identity and active foreign keys while making local_path nullable.
ALTER TABLE `storage_configs` ADD `__local_path` text;
--> statement-breakpoint
UPDATE `storage_configs` SET `__local_path` = `local_path`;
--> statement-breakpoint
ALTER TABLE `storage_configs` DROP COLUMN `local_path`;
--> statement-breakpoint
ALTER TABLE `storage_configs` RENAME COLUMN `__local_path` TO `local_path`;
--> statement-breakpoint
ALTER TABLE `storage_configs` ADD `endpoint` text;
--> statement-breakpoint
ALTER TABLE `storage_configs` ADD `region` text;
--> statement-breakpoint
ALTER TABLE `storage_configs` ADD `bucket` text;
--> statement-breakpoint
ALTER TABLE `storage_configs` ADD `path_prefix` text;
--> statement-breakpoint
ALTER TABLE `storage_configs` ADD `force_path_style` integer;
--> statement-breakpoint
ALTER TABLE `storage_configs` ADD `access_key_encrypted` text;
--> statement-breakpoint
ALTER TABLE `storage_configs` ADD `secret_key_encrypted` text;
--> statement-breakpoint
ALTER TABLE `storage_configs` ADD `config_revision` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `storage_configs` ADD `connection_status` text DEFAULT 'untested' NOT NULL;
--> statement-breakpoint
ALTER TABLE `storage_configs` ADD `connection_revision` integer;
--> statement-breakpoint
ALTER TABLE `storage_configs` ADD `connection_tested_at` integer;
--> statement-breakpoint
ALTER TABLE `storage_configs` ADD `cors_status` text DEFAULT 'untested' NOT NULL;
--> statement-breakpoint
ALTER TABLE `storage_configs` ADD `cors_revision` integer;
--> statement-breakpoint
ALTER TABLE `storage_configs` ADD `cors_origin` text;
--> statement-breakpoint
ALTER TABLE `storage_configs` ADD `cors_tested_at` integer;
