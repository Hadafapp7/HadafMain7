import { updateStreak } from "../utils/gamification";
import { Router, type IRouter } from "express";
import { desc, eq, sql, and, gte, lte } from "drizzle-orm";
import { db, appUsageEntriesTable } from "@workspace/db";
import {
  CreateAppUsageEntryBody,
  ListAppUsageEntriesResponse,
  GetAppUsageSummaryResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/app-usage", requireAuth, async (req, res): Promise<void> => {
  const entries = await db
    .select()
    .from(appUsageEntriesTable)
    .where(eq(appUsageEntriesTable.userId, req.userId!))
    .orderBy(desc(appUsageEntriesTable.loggedAt));

  res.json(ListAppUsageEntriesResponse.parse(entries));
});

router.get(
  "/app-usage/summary",
  requireAuth,
  async (req, res): Promise<void> => {
    const rows = await db
      .select({
        appName: appUsageEntriesTable.appName,
        category: appUsageEntriesTable.category,
        totalMinutes: sql<number>`sum(${appUsageEntriesTable.durationMinutes})`,
      })
      .from(appUsageEntriesTable)
      .where(eq(appUsageEntriesTable.userId, req.userId!))
      .groupBy(appUsageEntriesTable.appName, appUsageEntriesTable.category)
      .orderBy(
        desc(sql`sum(${appUsageEntriesTable.durationMinutes})`),
      );

    res.json(
      GetAppUsageSummaryResponse.parse(
        rows.map((row) => ({
          ...row,
          totalMinutes: Number(row.totalMinutes),
        })),
      ),
    );
  },
);

router.post("/app-usage", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateAppUsageEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await updateStreak(req.userId!);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Check if an entry for the same appName already exists today
  const existing = await db
    .select()
    .from(appUsageEntriesTable)
    .where(
      and(
        eq(appUsageEntriesTable.userId, req.userId!),
        eq(appUsageEntriesTable.appName, parsed.data.appName),
        gte(appUsageEntriesTable.loggedAt, todayStart),
        lte(appUsageEntriesTable.loggedAt, todayEnd)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Update the existing entry's duration to the latest value
    const [updated] = await db
      .update(appUsageEntriesTable)
      .set({ durationMinutes: parsed.data.durationMinutes })
      .where(eq(appUsageEntriesTable.id, existing[0].id))
      .returning();
    res.status(200).json(updated);
  } else {
    // Insert new entry
    const [entry] = await db
      .insert(appUsageEntriesTable)
      .values({ ...parsed.data, userId: req.userId! })
      .returning();
    res.status(201).json(entry);
  }
});

export default router;
