import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { usersTable } from "./users";

export const blockedAppsTable = pgTable("blocked_apps", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  appName: text("app_name").notNull(),
  category: text("category"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBlockedAppSchema = createInsertSchema(blockedAppsTable, {
  appName: z.string().min(1),
}).omit({
  id: true,
  userId: true,
  createdAt: true,
});
export type InsertBlockedApp = z.infer<typeof insertBlockedAppSchema>;
export type BlockedApp = typeof blockedAppsTable.$inferSelect;
