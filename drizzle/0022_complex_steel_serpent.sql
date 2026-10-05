CREATE TABLE `album_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`album_id` text NOT NULL,
	`token` text NOT NULL,
	`enabled` integer NOT NULL,
	`password_hash` text,
	`expires_at` integer,
	`layout` text NOT NULL,
	`show_name` integer NOT NULL,
	`auth_revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "album_shares_layout" CHECK("album_shares"."layout" IN ('grid', 'masonry'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `album_shares_album` ON `album_shares` (`album_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `album_shares_token` ON `album_shares` (`token`);--> statement-breakpoint
CREATE TABLE `share_grants` (
	`share_id` text NOT NULL,
	`grant_secret_hash` text NOT NULL,
	`auth_revision` integer NOT NULL,
	`verified_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`share_id`, `grant_secret_hash`),
	FOREIGN KEY (`share_id`) REFERENCES `album_shares`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `share_grants_expiry` ON `share_grants` (`expires_at`);