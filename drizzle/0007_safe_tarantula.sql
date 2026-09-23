CREATE TABLE `album_images` (
	`album_id` text NOT NULL,
	`image_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`album_id`, `image_id`),
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_id`) REFERENCES `media_images`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `album_images_album_joined_image` ON `album_images` (`album_id`,"joined_at" desc,`image_id`);--> statement-breakpoint
CREATE INDEX `album_images_image` ON `album_images` (`image_id`);--> statement-breakpoint
CREATE TABLE `albums` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`preferred_cover_image_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`preferred_cover_image_id`) REFERENCES `media_images`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `image_tags` (
	`image_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`image_id`, `tag_id`),
	FOREIGN KEY (`image_id`) REFERENCES `media_images`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `image_tags_tag_image` ON `image_tags` (`tag_id`,`image_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`normalized_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_normalized_key` ON `tags` (`normalized_key`);