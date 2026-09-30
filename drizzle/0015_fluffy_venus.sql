ALTER TABLE `storage_configs` ADD `cors_report` text;--> statement-breakpoint
ALTER TABLE `storage_probes` ADD `origin` text;--> statement-breakpoint
ALTER TABLE `storage_probes` ADD `invalidated` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `storage_probes` ADD `expires_at` integer;