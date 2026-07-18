CREATE TABLE `artists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artists_name_key_unique` ON `artists` (`name_key`);--> statement-breakpoint
CREATE TABLE `authors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `authors_name_key_unique` ON `authors` (`name_key`);--> statement-breakpoint
CREATE TABLE `board_comics` (
	`board_id` text NOT NULL,
	`comic_id` text NOT NULL,
	`position` real NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`board_id`, `comic_id`),
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comic_id`) REFERENCES `comics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `boards` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`tab_position` real NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `characters_name_key_unique` ON `characters` (`name_key`);--> statement-breakpoint
CREATE TABLE `comic_artists` (
	`comic_id` text NOT NULL,
	`artist_id` text NOT NULL,
	PRIMARY KEY(`comic_id`, `artist_id`),
	FOREIGN KEY (`comic_id`) REFERENCES `comics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `comic_authors` (
	`comic_id` text NOT NULL,
	`author_id` text NOT NULL,
	PRIMARY KEY(`comic_id`, `author_id`),
	FOREIGN KEY (`comic_id`) REFERENCES `comics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `comic_characters` (
	`comic_id` text NOT NULL,
	`character_id` text NOT NULL,
	PRIMARY KEY(`comic_id`, `character_id`),
	FOREIGN KEY (`comic_id`) REFERENCES `comics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `comic_tags` (
	`comic_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`comic_id`, `tag_id`),
	FOREIGN KEY (`comic_id`) REFERENCES `comics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `comics` (
	`id` text PRIMARY KEY NOT NULL,
	`series` text NOT NULL,
	`issue_number` text,
	`publisher` text,
	`cover_date` text,
	`image_path` text NOT NULL,
	`thumb_path` text NOT NULL,
	`blur_data_url` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`position` real NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_key_unique` ON `tags` (`name_key`);