CREATE TABLE `login_links` (
  `token` text PRIMARY KEY NOT NULL,
  `user_id` integer,
  `claimed_at` integer,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
