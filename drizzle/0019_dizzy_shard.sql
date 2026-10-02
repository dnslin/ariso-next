ALTER TABLE `upload_sessions` ADD `candidate_job_id` text;--> statement-breakpoint
ALTER TABLE `upload_sessions` ADD `route` text;--> statement-breakpoint
ALTER TABLE `upload_sessions` ADD `route_reason` text;--> statement-breakpoint
ALTER TABLE `upload_sessions` ADD `temporary_path` text;--> statement-breakpoint
ALTER TABLE `upload_sessions` ADD `signature_expires_at` integer;--> statement-breakpoint
ALTER TABLE `upload_sessions` ADD `source_etag` text;--> statement-breakpoint
ALTER TABLE `upload_sessions` ADD `temporary_bytes` integer;--> statement-breakpoint
ALTER TABLE `upload_sessions` ADD `final_bytes` integer;--> statement-breakpoint
ALTER TABLE `upload_sessions` ADD `confirmed_at` integer;