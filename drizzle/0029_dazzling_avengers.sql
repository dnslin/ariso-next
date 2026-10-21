CREATE TABLE `media_replacements` (
	`job_id` text PRIMARY KEY NOT NULL,
	`image_id` text NOT NULL,
	`original_name` text NOT NULL,
	`original_object_id` text,
	`snapshots` text NOT NULL,
	`facts` text,
	`metadata` text,
	FOREIGN KEY (`job_id`) REFERENCES `media_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_id`) REFERENCES `media_images`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`original_object_id`) REFERENCES `media_objects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `media_size_candidates` (
	`job_id` text NOT NULL,
	`source_version` text NOT NULL,
	`preset` text NOT NULL,
	`source_object_id` text NOT NULL,
	`object_id` text NOT NULL,
	PRIMARY KEY(`job_id`, `source_version`, `preset`),
	FOREIGN KEY (`job_id`) REFERENCES `media_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_object_id`) REFERENCES `media_objects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`object_id`) REFERENCES `media_objects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `media_size_requests` (
	`job_id` text PRIMARY KEY NOT NULL,
	`source_version` text NOT NULL,
	`preset` text NOT NULL,
	`source_object_id` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `media_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_object_id`) REFERENCES `media_objects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `media_size_versions` (
	`image_id` text NOT NULL,
	`source_version` text NOT NULL,
	`preset` text NOT NULL,
	`source_object_id` text NOT NULL,
	`object_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`image_id`, `source_version`, `preset`),
	FOREIGN KEY (`image_id`) REFERENCES `media_images`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_object_id`) REFERENCES `media_objects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`object_id`) REFERENCES `media_objects`(`id`) ON UPDATE no action ON DELETE no action
);
