CREATE TABLE `budgets` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `category_id` integer,
  `amount` real NOT NULL,
  `period` text DEFAULT 'monthly' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE INDEX `budget_user_idx` ON `budgets` (`user_id`);
CREATE UNIQUE INDEX `budget_user_cat_idx` ON `budgets` (`user_id`, `category_id`);

CREATE TABLE `alert_log` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `kind` text NOT NULL,
  `key` text NOT NULL,
  `sent_at` integer NOT NULL
);
CREATE INDEX `alert_lookup_idx` ON `alert_log` (`user_id`, `kind`, `key`);

CREATE TABLE `user_settings` (
  `user_id` integer PRIMARY KEY NOT NULL,
  `budget_alerts_enabled` integer DEFAULT 1 NOT NULL,
  `weekly_insights_enabled` integer DEFAULT 1 NOT NULL,
  `monthly_summary_enabled` integer DEFAULT 1 NOT NULL,
  `updated_at` integer NOT NULL
);
