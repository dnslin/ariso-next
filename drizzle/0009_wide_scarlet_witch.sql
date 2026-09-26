CREATE TABLE `analytics_daily` (
	`date` text NOT NULL,
	`timezone` text NOT NULL,
	`version` text NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`date`, `timezone`, `version`),
	CONSTRAINT "analytics_daily_version" CHECK("analytics_daily"."version" IN ('original', 'compressed', 'watermark'))
);
--> statement-breakpoint
CREATE TABLE `analytics_image_daily` (
	`image_id` text NOT NULL,
	`date` text NOT NULL,
	`timezone` text NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`image_id`, `date`, `timezone`)
);
--> statement-breakpoint
CREATE INDEX `analytics_image_daily_date_image_idx` ON `analytics_image_daily` (`date`,`image_id`);--> statement-breakpoint
CREATE TABLE `analytics_image_totals` (
	`image_id` text PRIMARY KEY NOT NULL,
	`original_count` integer DEFAULT 0 NOT NULL,
	`compressed_count` integer DEFAULT 0 NOT NULL,
	`watermark_count` integer DEFAULT 0 NOT NULL
);
