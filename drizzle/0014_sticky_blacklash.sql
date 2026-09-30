ALTER TABLE `media_settings` ADD `watermark_text` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `media_settings` ADD `watermark_font` text DEFAULT 'chinese' NOT NULL;--> statement-breakpoint
ALTER TABLE `media_settings` ADD `watermark_font_size` real DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `media_settings` ADD `watermark_color` text DEFAULT '#FFFFFF' NOT NULL;--> statement-breakpoint
ALTER TABLE `media_settings` ADD `watermark_stroke_color` text DEFAULT '#000000' NOT NULL;--> statement-breakpoint
ALTER TABLE `media_settings` ADD `watermark_stroke_width` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `media_settings` ADD `watermark_opacity` real DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE `media_settings` ADD `watermark_position` text DEFAULT 'bottom-right' NOT NULL;--> statement-breakpoint
ALTER TABLE `media_settings` ADD `watermark_margin` real DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `media_settings` ADD `watermark_width` real DEFAULT 20 NOT NULL;