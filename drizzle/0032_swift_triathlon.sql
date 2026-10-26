CREATE TABLE `smart_collections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`rules` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
