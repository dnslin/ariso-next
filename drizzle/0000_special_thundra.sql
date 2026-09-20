CREATE TABLE `site_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`public_url` text NOT NULL,
	`time_zone` text NOT NULL,
	`name` text DEFAULT 'Ariso' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`logo_key` text,
	`logo_mime` text,
	`favicon_key` text,
	`favicon_mime` text,
	`updated_at` integer NOT NULL,
	CONSTRAINT "site_settings_singleton" CHECK("site_settings"."id" = 1),
	CONSTRAINT "site_settings_logo_pair" CHECK(("site_settings"."logo_key" IS NULL) = ("site_settings"."logo_mime" IS NULL)),
	CONSTRAINT "site_settings_favicon_pair" CHECK(("site_settings"."favicon_key" IS NULL) = ("site_settings"."favicon_mime" IS NULL))
);
