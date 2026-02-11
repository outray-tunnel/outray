CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tunnels` (
	`container_id` text PRIMARY KEY NOT NULL,
	`port` integer NOT NULL,
	`subdomain` text,
	`status` text DEFAULT 'offline',
	`url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
