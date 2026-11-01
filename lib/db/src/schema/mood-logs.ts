import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const moodLogsTable = pgTable(
  "mood_logs",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    moodScore: integer("mood_score").notNull(), // 1 (Bad) to 5 (Great)
    moodLabel: text("mood_label").notNull(), // "Great" | "Good" | "Okay" | "Low" | "Bad"
    note: text("note"),
    date: text("date").notNull(), // "YYYY-MM-DD"
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userDateIdx: uniqueIndex("mood_logs_user_date_idx").on(table.userId, table.date),
  })
);

export type MoodLog = typeof moodLogsTable.$inferSelect;
export type NewMoodLog = typeof moodLogsTable.$inferInsert;
