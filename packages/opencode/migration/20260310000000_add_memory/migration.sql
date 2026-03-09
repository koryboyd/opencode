CREATE TABLE `memory` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL REFERENCES `project`(`id`) ON DELETE CASCADE,
	`content` text NOT NULL,
	`category` text NOT NULL DEFAULT 'general',
	`importance` integer NOT NULL DEFAULT 0,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);
CREATE INDEX `memory_project_idx` ON `memory` (`project_id`);
CREATE INDEX `memory_category_idx` ON `memory` (`category`);
