import { sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const achievementsTable = pgTable("user_achievements", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  badgeType: text("badge_type").notNull(), // "early_bird", "night_owl", "focus_guru", "deep_diver", "speedster", "zen_mode"
  earned: boolean("earned").notNull().default(false),
  unlockedAt: timestamp("unlocked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Achievement = typeof achievementsTable.$inferSelect;
