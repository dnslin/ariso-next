CREATE TABLE `identity_github_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`client_id` text DEFAULT '' NOT NULL,
	`client_secret_encrypted` text,
	`updated_at` integer NOT NULL,
	CONSTRAINT "identity_github_settings_singleton" CHECK("identity_github_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE `account` ADD `github_login` text;