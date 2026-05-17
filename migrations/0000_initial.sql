-- Initial schema for DuitKu

CREATE TABLE `users` (
  `telegram_id` integer PRIMARY KEY NOT NULL,
  `username` text,
  `first_name` text,
  `timezone` text DEFAULT 'Asia/Jakarta' NOT NULL,
  `currency` text DEFAULT 'IDR' NOT NULL,
  `language` text DEFAULT 'id' NOT NULL,
  `created_at` integer NOT NULL,
  `last_active_at` integer NOT NULL
);

CREATE TABLE `categories` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `name` text NOT NULL,
  `icon` text DEFAULT '📦' NOT NULL,
  `is_default` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL
);
CREATE INDEX `cat_user_idx` ON `categories` (`user_id`);

CREATE TABLE `receipts` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` integer NOT NULL,
  `r2_key` text NOT NULL,
  `mime` text NOT NULL,
  `width` integer,
  `height` integer,
  `size_bytes` integer,
  `ocr_json` text,
  `created_at` integer NOT NULL
);
CREATE INDEX `rec_user_idx` ON `receipts` (`user_id`);

CREATE TABLE `transactions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `amount` real NOT NULL,
  `currency` text DEFAULT 'IDR' NOT NULL,
  `category_id` integer,
  `merchant` text,
  `description` text,
  `occurred_at` integer NOT NULL,
  `receipt_id` text,
  `source` text NOT NULL,
  `raw_input` text,
  `llm_confidence` real,
  `items_json` text,
  `payment_method` text,
  `is_deleted` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL
);
CREATE INDEX `txn_user_occurred_idx` ON `transactions` (`user_id`, `occurred_at`);
CREATE INDEX `txn_user_category_idx` ON `transactions` (`user_id`, `category_id`);

CREATE TABLE `pending_confirmations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` integer NOT NULL,
  `chat_id` integer NOT NULL,
  `message_id` integer,
  `payload_json` text NOT NULL,
  `created_at` integer NOT NULL,
  `expires_at` integer NOT NULL
);
