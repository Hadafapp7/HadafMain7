import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { usersTable } from "./users";

export const APPEARANCE_MODES = ["light", "dark", "system"] as const;

export const userSettingsTable = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  notificationsEnabled: boolean("notifications_enabled").notNull().default(true),
  dailyReminderEnabled: boolean("daily_reminder_enabled").notNull().default(true),
  focusReminderEnabled: boolean("focus_reminder_enabled").notNull().default(true),
  appearance: text("appearance", { enum: APPEARANCE_MODES })
    .notNull()
    .default("system"),
  analyticsOptIn: boolean("analytics_opt_in").notNull().default(false),
  usageTrackingOptIn: boolean("usage_tracking_opt_in").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const updateUserSettingsSchema = createInsertSchema(userSettingsTable, {
  appearance: z.enum(APPEARANCE_MODES),
})
  .omit({ userId: true, updatedAt: true })
  .partial();
export type UpdateUserSettings = z.infer<typeof updateUserSettingsSchema>;
export type UserSettings = typeof userSettingsTable.$inferSelect;
