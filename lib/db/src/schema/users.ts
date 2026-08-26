import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user id
  email: text("email"),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  phone: text("phone"),
  gender: text("gender"),
  age: text("age"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  xp: integer("xp").notNull().default(0),
  level: integer("level").notNull().default(1),
  currentStreak: integer("current_streak").notNull().default(0),
  bestStreak: integer("best_streak").notNull().default(0),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
