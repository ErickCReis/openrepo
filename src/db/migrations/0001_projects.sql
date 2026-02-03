CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`repo` text NOT NULL,
	`default_branch` text NOT NULL,
	`created_at` integer NOT NULL
);
