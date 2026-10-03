CREATE TABLE `card_inbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fingerprint` text NOT NULL,
	`app` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer,
	`merchant` text,
	`date` text,
	`title` text NOT NULL,
	`text` text NOT NULL,
	`posted_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`suggested_category_id` integer,
	`suggestion_source` text,
	`suggested_at` integer,
	`paired_transaction_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`suggested_category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_inbox_fingerprint` ON `card_inbox` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `card_inbox_status` ON `card_inbox` (`status`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `merchant` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `suggested_category_id` integer REFERENCES categories(id);--> statement-breakpoint
ALTER TABLE `transactions` ADD `suggestion_source` text;