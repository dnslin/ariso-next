CREATE TABLE `access_protection_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`mode` text DEFAULT 'observe' NOT NULL,
	`rate` integer DEFAULT 10 NOT NULL,
	`burst` integer DEFAULT 200 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "access_protection_singleton" CHECK("access_protection_settings"."id" = 1),
	CONSTRAINT "access_protection_mode" CHECK("access_protection_settings"."mode" IN ('off', 'observe', 'enforce')),
	CONSTRAINT "access_protection_rate" CHECK(typeof("access_protection_settings"."rate") = 'integer' AND "access_protection_settings"."rate" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "access_protection_burst" CHECK(typeof("access_protection_settings"."burst") = 'integer' AND "access_protection_settings"."burst" BETWEEN 1 AND 9007199254740991)
);
--> statement-breakpoint
INSERT INTO `access_protection_settings` (`id`) VALUES (1);
