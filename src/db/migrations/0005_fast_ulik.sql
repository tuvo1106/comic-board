CREATE INDEX `board_comics_comic_idx` ON `board_comics` (`comic_id`);--> statement-breakpoint
CREATE INDEX `boards_user_tab_idx` ON `boards` (`user_id`,`tab_position`);--> statement-breakpoint
CREATE INDEX `comics_user_position_idx` ON `comics` (`user_id`,`position`);--> statement-breakpoint
CREATE INDEX `comics_deleted_at_idx` ON `comics` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `comics_publisher_idx` ON `comics` (`publisher_id`);