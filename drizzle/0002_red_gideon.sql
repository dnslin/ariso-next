CREATE TABLE `media_images` (
	`id` text PRIMARY KEY NOT NULL,
	`storage_id` text NOT NULL,
	`original_name` text NOT NULL,
	`display_name` text NOT NULL,
	`visibility` text NOT NULL,
	`format` text NOT NULL,
	`mime` text NOT NULL,
	`width` integer,
	`height` integer,
	`byte_size` integer NOT NULL,
	`animated` integer,
	`page_count` integer,
	`classification` text,
	`processing_status` text NOT NULL,
	`trashed_at` integer,
	`deletion_status` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`storage_id`) REFERENCES `storage_configs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "media_images_visibility" CHECK("media_images"."visibility" in ('public', 'private')),
	CONSTRAINT "media_images_processing_status" CHECK("media_images"."processing_status" in ('pending', 'processing', 'ready', 'failed')),
	CONSTRAINT "media_images_deletion_status" CHECK("media_images"."deletion_status" in ('deleting', 'cleanup_failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_images_storage_identity` ON `media_images` (`id`,`storage_id`);--> statement-breakpoint
CREATE TABLE `media_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`image_id` text NOT NULL,
	`kind` text NOT NULL,
	`scope` text NOT NULL,
	`snapshot` text NOT NULL,
	`expected_versions` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`image_id`) REFERENCES `media_images`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "media_jobs_status" CHECK("media_jobs"."status" in ('queued', 'running', 'succeeded', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX `media_jobs_image_created` ON `media_jobs` (`image_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_jobs_image_identity` ON `media_jobs` (`id`,`image_id`);--> statement-breakpoint
CREATE TABLE `media_objects` (
	`id` text PRIMARY KEY NOT NULL,
	`image_id` text NOT NULL,
	`job_id` text,
	`storage_id` text NOT NULL,
	`key` text NOT NULL,
	`purpose` text NOT NULL,
	`status` text NOT NULL,
	`byte_size` integer,
	`format` text,
	`mime` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`image_id`,`storage_id`) REFERENCES `media_images`(`id`,`storage_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`,`image_id`) REFERENCES `media_jobs`(`id`,`image_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "media_objects_status" CHECK("media_objects"."status" in ('planned', 'writing', 'stored', 'cleanup_pending', 'cleanup_failed', 'deleted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_objects_storage_key` ON `media_objects` (`storage_id`,`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_objects_version_identity` ON `media_objects` (`image_id`,`id`,`purpose`);--> statement-breakpoint
CREATE TABLE `media_versions` (
	`image_id` text NOT NULL,
	`kind` text NOT NULL,
	`object_id` text NOT NULL,
	`width` integer,
	`height` integer,
	`byte_size` integer NOT NULL,
	`format` text NOT NULL,
	`mime` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`image_id`, `kind`),
	FOREIGN KEY (`image_id`) REFERENCES `media_images`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`image_id`,`object_id`,`kind`) REFERENCES `media_objects`(`image_id`,`id`,`purpose`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "media_versions_kind" CHECK("media_versions"."kind" in ('original', 'compressed', 'thumbnail', 'watermark'))
);
