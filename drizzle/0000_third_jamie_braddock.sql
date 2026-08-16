CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `availability` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`theme_id` text NOT NULL,
	`play_date` text NOT NULL,
	`start_time` text NOT NULL,
	`capacity` integer DEFAULT 5 NOT NULL,
	`booked_count` integer DEFAULT 0 NOT NULL,
	`open_room` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `availability_slot_unique` ON `availability` (`theme_id`,`play_date`,`start_time`);--> statement-breakpoint
CREATE INDEX `availability_date_idx` ON `availability` (`play_date`);--> statement-breakpoint
CREATE TABLE `inquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_name` text NOT NULL,
	`phone_hash` text NOT NULL,
	`phone_masked` text NOT NULL,
	`phone_encrypted` text,
	`subject` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'NEW' NOT NULL,
	`response` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inquiries_status_idx` ON `inquiries` (`status`);--> statement-breakpoint
CREATE TABLE `notices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`published` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`provider` text DEFAULT 'KISPG' NOT NULL,
	`provider_transaction_id` text,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'READY' NOT NULL,
	`approved_at` text,
	`raw_result_code` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payments_reservation_idx` ON `payments` (`reservation_id`);--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`lookup_code` text NOT NULL,
	`theme_id` text NOT NULL,
	`play_date` text NOT NULL,
	`start_time` text NOT NULL,
	`customer_name` text NOT NULL,
	`phone_hash` text NOT NULL,
	`phone_masked` text NOT NULL,
	`phone_encrypted` text,
	`party_size` integer NOT NULL,
	`open_room` integer DEFAULT false NOT NULL,
	`special_request` text DEFAULT '' NOT NULL,
	`total_amount` integer NOT NULL,
	`status` text DEFAULT 'PENDING_PAYMENT' NOT NULL,
	`payment_status` text DEFAULT 'READY' NOT NULL,
	`cancellation_reason` text,
	`canceled_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reservations_lookup_unique` ON `reservations` (`lookup_code`);--> statement-breakpoint
CREATE INDEX `reservations_phone_idx` ON `reservations` (`phone_hash`);--> statement-breakpoint
CREATE INDEX `reservations_slot_idx` ON `reservations` (`theme_id`,`play_date`,`start_time`);--> statement-breakpoint
CREATE TABLE `themes` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`episode` integer NOT NULL,
	`title` text NOT NULL,
	`price` integer DEFAULT 23000 NOT NULL,
	`duration_minutes` integer DEFAULT 90 NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `themes_slug_unique` ON `themes` (`slug`);