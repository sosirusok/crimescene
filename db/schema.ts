import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const themes = sqliteTable("themes", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  episode: integer("episode").notNull(),
  title: text("title").notNull(),
  price: integer("price").notNull().default(23000),
  durationMinutes: integer("duration_minutes").notNull().default(90),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("themes_slug_unique").on(table.slug)]);

export const availability = sqliteTable("availability", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  themeId: text("theme_id").notNull().references(() => themes.id),
  playDate: text("play_date").notNull(),
  startTime: text("start_time").notNull(),
  capacity: integer("capacity").notNull().default(5),
  bookedCount: integer("booked_count").notNull().default(0),
  openRoom: integer("open_room", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("OPEN"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("availability_slot_unique").on(table.themeId, table.playDate, table.startTime),
  index("availability_date_idx").on(table.playDate),
]);

export const reservations = sqliteTable("reservations", {
  id: text("id").primaryKey(),
  lookupCode: text("lookup_code").notNull(),
  themeId: text("theme_id").notNull().references(() => themes.id),
  playDate: text("play_date").notNull(),
  startTime: text("start_time").notNull(),
  customerName: text("customer_name").notNull(),
  phoneHash: text("phone_hash").notNull(),
  phoneMasked: text("phone_masked").notNull(),
  phoneEncrypted: text("phone_encrypted"),
  partySize: integer("party_size").notNull(),
  openRoom: integer("open_room", { mode: "boolean" }).notNull().default(false),
  specialRequest: text("special_request").notNull().default(""),
  totalAmount: integer("total_amount").notNull(),
  status: text("status").notNull().default("CONFIRMED"),
  paymentStatus: text("payment_status").notNull().default("READY"),
  cancellationReason: text("cancellation_reason"),
  canceledAt: text("canceled_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("reservations_lookup_unique").on(table.lookupCode),
  index("reservations_phone_idx").on(table.phoneHash),
  index("reservations_slot_idx").on(table.themeId, table.playDate, table.startTime),
]);

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  reservationId: text("reservation_id").notNull().references(() => reservations.id),
  provider: text("provider").notNull().default("ONSITE"),
  providerTransactionId: text("provider_transaction_id"),
  amount: integer("amount").notNull(),
  status: text("status").notNull().default("READY"),
  approvedAt: text("approved_at"),
  rawResultCode: text("raw_result_code"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("payments_reservation_idx").on(table.reservationId)]);

export const notices = sqliteTable("notices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  published: integer("published", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const inquiries = sqliteTable("inquiries", {
  id: text("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  phoneHash: text("phone_hash").notNull(),
  phoneMasked: text("phone_masked").notNull(),
  phoneEncrypted: text("phone_encrypted"),
  subject: text("subject").notNull(),
  content: text("content").notNull(),
  status: text("status").notNull().default("NEW"),
  response: text("response"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("inquiries_status_idx").on(table.status)]);

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  metadata: text("metadata").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
