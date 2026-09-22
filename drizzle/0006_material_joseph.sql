ALTER TABLE `media_jobs` ADD `step` text DEFAULT 'identify' NOT NULL;--> statement-breakpoint
ALTER TABLE `media_jobs` ADD `retry_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `media_jobs` ADD `recovery_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `media_jobs` ADD `next_attempt_at` integer;