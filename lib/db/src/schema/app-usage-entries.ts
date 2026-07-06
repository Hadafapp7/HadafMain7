import { sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { usersTable } from "./users";

export const appUsageEntriesTable = pgTable("app_usage_entries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  appName: text("app_name").notNull(),
  category: text("category"),
  durationMinutes: integer("duration_minutes").notNull(),
  loggedAt: timestamp("logged_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAppUsageEntrySchema = createInsertSchema(
  appUsageEntriesTable,
  {
    durationMinutes: z.number().int().positive(),
  },
).omit({
  id: true,
  userId: true,
  createdAt: true,
});
export type InsertAppUsageEntry = z.infer<typeof insertAppUsageEntrySchema>;
export type AppUsageEntry = typeof appUsageEntriesTable.$inferSelect;
