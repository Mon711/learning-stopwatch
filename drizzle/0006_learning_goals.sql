CREATE TABLE `learning_goals` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`start_day` text NOT NULL,
	`end_day` text NOT NULL,
	`target_ms` integer NOT NULL,
	`scope` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`history` text DEFAULT '[]' NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
