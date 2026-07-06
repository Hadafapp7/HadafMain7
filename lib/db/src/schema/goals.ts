import { sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { usersTable } from "./users";

export const GOAL_TYPES = ["daily", "scheduled"] as const;
export const GOAL_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const GOAL_STATUSES = ["pending", "done"] as const;

export const goalsTable = pgTable("goals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  intent: text("intent"),
  type: text("type", { enum: GOAL_TYPES }).notNull(),
  priority: text("priority", { enum: GOAL_PRIORITIES })
    .notNull()
    .default("medium"),
  startTime: text("start_time").notNull(), // "HH:MM"
  durationMinutes: integer("duration_minutes").notNull(),
  scheduledDate: text("scheduled_date"), // "YYYY-MM-DD", only for type=scheduled
  status: text("status", { enum: GOAL_STATUSES }).notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertGoalSchema = createInsertSchema(goalsTable, {
  type: z.enum(GOAL_TYPES),
  priority: z.enum(GOAL_PRIORITIES),
  status: z.enum(GOAL_STATUSES),
}).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type Goal = typeof goalsTable.$inferSelect;
