CREATE TABLE `budgets` (
	`effective_from` text PRIMARY KEY NOT NULL,
	`total` integer NOT NULL,
	`category_budgets` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`is_default` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fixed_costs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`amount` integer NOT NULL,
	`category_id` integer NOT NULL,
	`day_of_month` integer NOT NULL,
	`payment_method` text,
	`sort_order` integer NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "fixed_costs_amount" CHECK("fixed_costs"."amount" > 0),
	CONSTRAINT "fixed_costs_day" CHECK("fixed_costs"."day_of_month" BETWEEN 1 AND 31)
);
--> statement-breakpoint
CREATE TABLE `reason_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`is_default` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`category_id` integer NOT NULL,
	`reason_tag_id` integer,
	`satisfaction` text,
	`memo` text,
	`payment_method` text,
	`is_fixed` integer DEFAULT false NOT NULL,
	`fixed_cost_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reason_tag_id`) REFERENCES `reason_tags`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fixed_cost_id`) REFERENCES `fixed_costs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transactions_amount" CHECK("transactions"."amount" > 0),
	CONSTRAINT "transactions_fixed_cost" CHECK("transactions"."fixed_cost_id" IS NULL OR "transactions"."is_fixed" = 1)
);
--> statement-breakpoint
CREATE INDEX `transactions_date` ON `transactions` (`date`);