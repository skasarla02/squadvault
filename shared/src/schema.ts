import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// --- Enums -----------------------------------------------------------------

/** Mirrors the escrow state machine in state-machine.ts. Keep in sync. */
export const vaultStatusEnum = pgEnum("vault_status", [
  "draft",
  "collecting",
  "funded",
  "paused",
  "executing",
  "completed",
  "refunding",
  "refunded",
  "cancelled",
]);

export const pledgeHoldStatusEnum = pgEnum("pledge_hold_status", [
  "pending", // no PaymentIntent yet
  "authorized", // PaymentIntent authorized, manual capture pending
  "voided", // hold cancelled / refunded, member left or vault refunded
  "captured", // funds captured on successful execution
  "failed", // authorization attempt failed
]);

/** Tracks a member's response to an edge-case prompt (top-up, dropout re-split). */
export const consentStatusEnum = pgEnum("consent_status", [
  "not_required",
  "pending",
  "approved",
  "rejected",
]);

export const userRoleEnum = pgEnum("user_role", ["planner", "participant"]);

/** Why a vault is currently paused awaiting member consent. Drives which event types get logged on resume/reject. */
export const vaultPauseReasonEnum = pgEnum("vault_pause_reason", ["price_jump", "dropout"]);

// --- Tables ------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: userRoleEnum("role").notNull().default("participant"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vaults = pgTable("vaults", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  goalAmountCents: integer("goal_amount_cents").notNull(),
  bufferPct: numeric("buffer_pct", { precision: 5, scale: 2 }).notNull().default("5.00"),
  deadline: timestamp("deadline", { withTimezone: true }).notNull(),
  merchantName: text("merchant_name").notNull(),
  merchantMcc: text("merchant_mcc"),
  status: vaultStatusEnum("status").notNull().default("draft"),
  pauseReason: vaultPauseReasonEnum("pause_reason"),
  pendingGoalAmountCents: integer("pending_goal_amount_cents"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pledges = pgTable("pledges", {
  id: uuid("id").primaryKey().defaultRandom(),
  vaultId: uuid("vault_id")
    .notNull()
    .references(() => vaults.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  shareAmountCents: integer("share_amount_cents").notNull(),
  holdStatus: pledgeHoldStatusEnum("hold_status").notNull().default("pending"),
  consentStatus: consentStatusEnum("consent_status").notNull().default("not_required"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  vaultId: uuid("vault_id")
    .notNull()
    .references(() => vaults.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cards = pgTable("cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  vaultId: uuid("vault_id")
    .notNull()
    .references(() => vaults.id, { onDelete: "cascade" }),
  stripeIssuingCardId: text("stripe_issuing_card_id"),
  stripeCardholderId: text("stripe_cardholder_id"),
  isMocked: boolean("is_mocked").notNull().default(true),
  mccLocks: jsonb("mcc_locks").notNull().default([]),
  last4: text("last4"),
  brand: text("brand"),
  expMonth: integer("exp_month"),
  expYear: integer("exp_year"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Relations ---------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  ledVaults: many(vaults),
  pledges: many(pledges),
}));

export const vaultsRelations = relations(vaults, ({ one, many }) => ({
  lead: one(users, { fields: [vaults.leadId], references: [users.id] }),
  pledges: many(pledges),
  events: many(events),
  cards: many(cards),
}));

export const pledgesRelations = relations(pledges, ({ one }) => ({
  vault: one(vaults, { fields: [pledges.vaultId], references: [vaults.id] }),
  user: one(users, { fields: [pledges.userId], references: [users.id] }),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  vault: one(vaults, { fields: [events.vaultId], references: [vaults.id] }),
}));

export const cardsRelations = relations(cards, ({ one }) => ({
  vault: one(vaults, { fields: [cards.vaultId], references: [vaults.id] }),
}));

// --- Zod schemas + inferred types ---------------------------------------------

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const selectUserSchema = createSelectSchema(users);
export type User = z.infer<typeof selectUserSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;

export const insertVaultSchema = createInsertSchema(vaults, {
  // API requests carry JSON, so deadline arrives as an ISO string, not a Date.
  deadline: z.coerce.date(),
}).omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});
export const selectVaultSchema = createSelectSchema(vaults);
export type Vault = z.infer<typeof selectVaultSchema>;
export type InsertVault = z.infer<typeof insertVaultSchema>;

export const insertPledgeSchema = createInsertSchema(pledges).omit({
  id: true,
  holdStatus: true,
  consentStatus: true,
  stripePaymentIntentId: true,
  createdAt: true,
  updatedAt: true,
});
export const selectPledgeSchema = createSelectSchema(pledges);
export type Pledge = z.infer<typeof selectPledgeSchema>;
export type InsertPledge = z.infer<typeof insertPledgeSchema>;

export const selectEventSchema = createSelectSchema(events);
export type VaultEvent = z.infer<typeof selectEventSchema>;

export const selectCardSchema = createSelectSchema(cards);
export type Card = z.infer<typeof selectCardSchema>;
