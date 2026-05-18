-- Pending jobs queue untuk retry kalau LLM down sementara
CREATE TABLE `pending_jobs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `chat_id` integer NOT NULL,
  `kind` text NOT NULL, -- 'photo' | 'text'
  `payload_json` text NOT NULL, -- {telegram_file_id?, mime?, text?, reply_message_id?}
  `attempts` integer DEFAULT 0 NOT NULL,
  `max_attempts` integer DEFAULT 5 NOT NULL,
  `next_retry_at` integer NOT NULL,
  `last_error` text,
  `status` text DEFAULT 'pending' NOT NULL, -- 'pending' | 'done' | 'failed'
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE INDEX `pending_user_idx` ON `pending_jobs` (`user_id`);
CREATE INDEX `pending_retry_idx` ON `pending_jobs` (`status`, `next_retry_at`);

-- LLM provider stats (untuk /stats + observability)
CREATE TABLE `provider_stats` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `provider` text NOT NULL,
  `kind` text NOT NULL, -- 'receipt' | 'text'
  `success` integer NOT NULL, -- 0 or 1
  `duration_ms` integer,
  `error` text,
  `created_at` integer NOT NULL
);
CREATE INDEX `stats_provider_idx` ON `provider_stats` (`provider`, `created_at`);
CREATE INDEX `stats_recent_idx` ON `provider_stats` (`created_at`);
