CREATE TABLE `github_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`github_user_id` integer NOT NULL,
	`username` text NOT NULL,
	`email` text,
	`access_token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_tokens_github_user_id_unique` ON `github_tokens` (`github_user_id`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `github_token_id` text;