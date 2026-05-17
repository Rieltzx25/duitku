import { sqliteTable, integer, text, real, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  telegramId: integer("telegram_id").primaryKey(),
  username: text("username"),
  firstName: text("first_name"),
  timezone: text("timezone").notNull().default("Asia/Jakarta"),
  currency: text("currency").notNull().default("IDR"),
  language: text("language").notNull().default("id"),
  createdAt: integer("created_at").notNull(),
  lastActiveAt: integer("last_active_at").notNull(),
});

export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    name: text("name").notNull(),
    icon: text("icon").notNull().default("📦"),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({ userIdx: index("cat_user_idx").on(t.userId) }),
);

export const receipts = sqliteTable(
  "receipts",
  {
    id: text("id").primaryKey(), // uuid
    userId: integer("user_id").notNull(),
    r2Key: text("r2_key").notNull(),
    mime: text("mime").notNull(),
    width: integer("width"),
    height: integer("height"),
    sizeBytes: integer("size_bytes"),
    ocrJson: text("ocr_json"), // raw structured output from Gemini
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({ userIdx: index("rec_user_idx").on(t.userId) }),
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    amount: real("amount").notNull(), // IDR. real karena bisa pecahan
    currency: text("currency").notNull().default("IDR"),
    categoryId: integer("category_id"),
    merchant: text("merchant"),
    description: text("description"),
    occurredAt: integer("occurred_at").notNull(), // unix seconds
    receiptId: text("receipt_id"),
    source: text("source", { enum: ["photo", "text", "voice", "qris", "manual"] }).notNull(),
    rawInput: text("raw_input"),
    llmConfidence: real("llm_confidence"),
    itemsJson: text("items_json"), // detail item dari nota
    paymentMethod: text("payment_method"),
    isDeleted: integer("is_deleted", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    userOccurredIdx: index("txn_user_occurred_idx").on(t.userId, t.occurredAt),
    userCategoryIdx: index("txn_user_category_idx").on(t.userId, t.categoryId),
  }),
);

// Pending confirmations (state machine antara user kirim nota → bot tanya konfirmasi)
export const pendingConfirmations = sqliteTable("pending_confirmations", {
  id: text("id").primaryKey(), // uuid
  userId: integer("user_id").notNull(),
  chatId: integer("chat_id").notNull(),
  messageId: integer("message_id"), // pesan bot yang berisi konfirmasi
  payloadJson: text("payload_json").notNull(), // draft transaction
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type Receipt = typeof receipts.$inferSelect;
export type PendingConfirmation = typeof pendingConfirmations.$inferSelect;
