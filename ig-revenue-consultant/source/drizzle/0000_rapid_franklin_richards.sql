CREATE TABLE `revenue_ai_usage` (
	`owner_id` text NOT NULL,
	`day` text NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`owner_id`, `day`)
);
--> statement-breakpoint
CREATE TABLE `revenue_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `revenue_connections` (
	`owner_id` text NOT NULL,
	`provider` text NOT NULL,
	`encrypted` text NOT NULL,
	`metadata` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `provider`)
);
--> statement-breakpoint
CREATE TABLE `revenue_external_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`content_id` text NOT NULL,
	`status` text NOT NULL,
	`container_id` text,
	`media_id` text,
	`message` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `revenue_workspaces` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`state` text NOT NULL,
	`updated_at` text NOT NULL
);
