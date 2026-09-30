CREATE TABLE `media_metadata` (
	`image_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`data` text,
	`photography` text,
	`read_at` integer,
	`attempted_at` integer,
	`error` text,
	FOREIGN KEY (`image_id`) REFERENCES `media_images`(`id`) ON UPDATE no action ON DELETE no action
);
