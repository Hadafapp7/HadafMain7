import { sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { usersTable } from "./users";

export const FOCUS_SESSION_STATUSES = ["running", "paused", "completed", "stopped"] as const;

export const focusSessionsTable = pgTable("focus_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  intention: text("intention"),
  plannedDurationMinutes: integer("planned_duration_minutes").notNull(),
  blockedApps: jsonb("blocked_apps").$type<string[]>().notNull().default([]),
  status: text("status", { enum: FOCUS_SESSION_STATUSES })
    .notNull()
    .default("running"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
});

export const insertFocusSessionSchema = createInsertSchema(
  focusSessionsTable,
  {
    plannedDurationMinutes: z.number().int().positive(),
    blockedApps: z.array(z.string()),
  },
).omit({
  id: true,
  userId: true,
  startedAt: true,
  endedAt: true,
  status: true,
});
export type InsertFocusSession = z.infer<typeof insertFocusSessionSchema>;
export type FocusSession = typeof focusSessionsTable.$inferSelect;
