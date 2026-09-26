CREATE TABLE `retrospectives` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`facts` text NOT NULL,
	`output` text NOT NULL,
	`model_id` text NOT NULL,
	`prompt_version` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `retrospectives_period` ON `retrospectives` (`kind`,`period_start`);