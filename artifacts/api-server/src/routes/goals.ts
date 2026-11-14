import { awardXpAndCheckBadges, updateStreak } from "../utils/gamification";
import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, goalsTable } from "@workspace/db";
import {
  CreateGoalBody,
  UpdateGoalBody,
  UpdateGoalParams,
  DeleteGoalParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getUserPlan } from "../lib/plan";
import { ensureSchema } from "../lib/schema-sync";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** The generated zod schemas use `.optional()` (not `.nullish()`), so a `null` from the app would be rejected. */
function stripNulls(body: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (body && typeof body === "object") {
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (v !== null && v !== undefined) out[k] = v;
    }
  }
  return out;
}

router.get("/goals", requireAuth, async (req, res): Promise<void> => {
  try {
    await ensureSchema();
    const goals = await db
      .select()
      .from(goalsTable)
      .where(eq(goalsTable.userId, req.userId!))
      .orderBy(goalsTable.createdAt);

    res.json(goals);
  } catch (err: any) {
    logger.error({ err: err?.message ?? err }, "[goals] list failed");
    res.status(500).json({ error: "Could not load your goals. Please try again." });
  }
});

router.post("/goals", requireAuth, async (req, res): Promise<void> => {
  try {
    await ensureSchema();

    const body = stripNulls(req.body);
    const parsed = CreateGoalBody.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const planInfo = await getUserPlan(req.userId!);
    if (planInfo.plan === "limited") {
      res.status(402).json({
        error: "Your free trial has ended. Upgrade to Hadaf Pro to create goals.",
        code: "SUBSCRIPTION_REQUIRED",
      });
      return;
    }

    const [goal] = await db
      .insert(goalsTable)
      .values({
        ...parsed.data,
        blockApps: body.blockApps === true,
        userId: req.userId!,
      })
      .returning();

    res.status(201).json(goal);
  } catch (err: any) {
    logger.error({ err: err?.message ?? err }, "[goals] create failed");
    res.status(500).json({ error: "Could not save your goal. Please try again." });
  }
});

router.patch("/goals/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    await ensureSchema();

    const params = UpdateGoalParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const body = stripNulls(req.body);
    const parsed = UpdateGoalBody.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const changes: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
    // Only touch these when the caller actually sent them (a normal edit must not wipe a stored reason).
    if (typeof body.forfeitReason === "string") changes.forfeitReason = body.forfeitReason;
    if (typeof body.forfeitRoast === "string") changes.forfeitRoast = body.forfeitRoast;
    if (typeof body.blockApps === "boolean") changes.blockApps = body.blockApps;

    const [goal] = await db
      .update(goalsTable)
      .set(changes)
      .where(and(eq(goalsTable.id, params.data.id), eq(goalsTable.userId, req.userId!)))
      .returning();

    if (!goal) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    if (parsed.data.status === "done") {
      await awardXpAndCheckBadges(req.userId!, 20, "goal_done");
      await updateStreak(req.userId!);
    }

    res.json(goal);
  } catch (err: any) {
    logger.error({ err: err?.message ?? err }, "[goals] update failed");
    res.status(500).json({ error: "Could not update your goal. Please try again." });
  }
});

router.delete("/goals/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const params = DeleteGoalParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [goal] = await db
      .delete(goalsTable)
      .where(and(eq(goalsTable.id, params.data.id), eq(goalsTable.userId, req.userId!)))
      .returning();

    if (!goal) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    res.sendStatus(204);
  } catch (err: any) {
    logger.error({ err: err?.message ?? err }, "[goals] delete failed");
    res.status(500).json({ error: "Could not delete your goal. Please try again." });
  }
});

export default router;
