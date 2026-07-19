CREATE TABLE `publishers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publishers_name_key_unique` ON `publishers` (`name_key`);--> statement-breakpoint
ALTER TABLE `comics` ADD `publisher_id` text REFERENCES publishers(id);--> statement-breakpoint
-- Backfill: create one publisher row per distinct (case-insensitive) name, then
-- point each comic at it. `lower(trim(...))` mirrors the app's nameKey().
INSERT INTO `publishers` (`id`, `name`, `name_key`)
SELECT lower(hex(randomblob(7))), trim(min(`publisher`)), lower(trim(`publisher`))
FROM `comics`
WHERE `publisher` IS NOT NULL AND trim(`publisher`) <> ''
GROUP BY lower(trim(`publisher`));--> statement-breakpoint
UPDATE `comics`
SET `publisher_id` = (
	SELECT `p`.`id` FROM `publishers` `p` WHERE `p`.`name_key` = lower(trim(`comics`.`publisher`))
)
WHERE `publisher` IS NOT NULL AND trim(`publisher`) <> '';