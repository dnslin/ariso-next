DROP INDEX `analytics_image_daily_date_image_idx`;--> statement-breakpoint
CREATE INDEX `analytics_image_daily_date_image_count_idx` ON `analytics_image_daily` (`date`,`image_id`,`count`);