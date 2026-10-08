CREATE TABLE `identity_smtp_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`host` text NOT NULL,
	`port` integer NOT NULL,
	`mode` text NOT NULL,
	`username` text DEFAULT '' NOT NULL,
	`password_encrypted` text,
	`from_name` text NOT NULL,
	`from_email` text NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "identity_smtp_settings_singleton" CHECK("identity_smtp_settings"."id" = 1),
	CONSTRAINT "identity_smtp_settings_port" CHECK("identity_smtp_settings"."port" BETWEEN 1 AND 65535),
	CONSTRAINT "identity_smtp_settings_mode" CHECK("identity_smtp_settings"."mode" IN ('tls', 'starttls')),
	CONSTRAINT "identity_smtp_settings_credentials" CHECK("identity_smtp_settings"."username" != '' OR "identity_smtp_settings"."password_encrypted" IS NULL)
);
