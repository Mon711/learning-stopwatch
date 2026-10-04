CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`activity` text NOT NULL,
	`state` text NOT NULL,
	`started_at` integer NOT NULL,
	`stopped_at` integer,
	`day` text NOT NULL,
	`elapsed_ms` integer DEFAULT 0 NOT NULL,
	`resumed_at` integer,
	`version` integer DEFAULT 0 NOT NULL,
	`what` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_owner_started` ON `sessions` (`owner`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_one_open_session` ON `sessions` (`owner`) WHERE "sessions"."state" != 'stopped';