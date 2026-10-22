CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_store_time` ON `audit` (`store_id`,`at`,`id`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires` text NOT NULL,
	`used_at` text,
	`revoked` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_token` ON `invitations` (`token_hash`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`disabled` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_identity` ON `members` (`store_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `records` (
	`store_id` text NOT NULL,
	`kind` text NOT NULL,
	`id` text NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`store_id`, `kind`, `id`)
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` text PRIMARY KEY NOT NULL,
	`shop` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`write_id` text DEFAULT '' NOT NULL
);
