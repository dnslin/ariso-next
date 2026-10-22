CREATE TABLE `image_shares` (
	`image_id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`source_version` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`image_id`) REFERENCES `media_images`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "image_shares_source_version" CHECK("image_shares"."source_version" IN ('original', 'compressed', 'thumbnail'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `image_shares_token_unique` ON `image_shares` (`token`);--> statement-breakpoint
ALTER TABLE `media_images` ADD `content_updated_at` integer;