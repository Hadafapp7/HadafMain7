import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { usersTable } from "./users";

export const analyticsSnapshotsTable = pgTable("analytics_snapshots", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  range: text("range").notNull(), // "WEEK" | "MONTH" | "YEAR"
  focusScore: integer("focus_score").notNull().default(0),
  screenMinutes: integer("screen_minutes").notNull().default(0),
  targetMinutes: integer("target_minutes").notNull().default(180),
  focusCompleted: integer("focus_completed").notNull().default(0),
  focusForfeited: integer("focus_forfeited").notNull().default(0),
  goalsCompleted: integer("goals_completed").notNull().default(0),
  goalsMissed: integer("goals_missed").notNull().default(0),
  goalsForfeited: integer("goals_forfeited").notNull().default(0),
  diagnosticSummary: text("diagnostic_summary"),
  diagnosticDetails: jsonb("diagnostic_details").$type<string[]>().default([]),
  topApps: jsonb("top_apps").$type<{ appName: string; minutes: number }[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertAnalyticsSnapshotSchema = createInsertSchema(analyticsSnapshotsTable);
export const selectAnalyticsSnapshotSchema = createSelectSchema(analyticsSnapshotsTable);
export type AnalyticsSnapshot = typeof analyticsSnapshotsTable.$inferSelect;
export type NewAnalyticsSnapshot = typeof analyticsSnapshotsTable.$inferInsert;

