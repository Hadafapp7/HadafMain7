import { awardXpAndCheckBadges, updateStreak } from "../utils/gamification";
import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, goalsTable } from "@workspace/db";
import {
  CreateGoalBody,
  UpdateGoalBody,
  UpdateGoalParams,
  DeleteGoalParams,
  ListGoalsResponse,
  UpdateGoalResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getUserPlan } from "../lib/plan";

const router: IRouter = Router();

let goalColumnsEnsured = false;
async function ensureGoalColumns() {
  if (goalColumnsEnsured) return;
  try {
    await db.execute(sql`
      ALTER TABLE goals ADD COLUMN IF NOT EXISTS forfeit_reason text;
      ALTER TABLE goals ADD COLUMN IF NOT EXISTS forfeit_roast text;
    `);
    goalColumnsEnsured = true;
  } catch {}
}

router.get("/goals", requireAuth, async (req, res): Promise<void> => {
  const goals = await db
    .select()
    .from(goalsTable)
    .where(eq(goalsTable.userId, req.userId!))
    .orderBy(goalsTable.createdAt);

  res.json(goals);
});

router.post("/goals", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateGoalBody.safeParse(req.body);
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
    .values({ ...parsed.data, userId: req.userId! })
    .returning();

  res.status(201).json(UpdateGoalResponse.parse(goal));
});

router.patch("/goals/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateGoalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateGoalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [goal] = await db
    .update(goalsTable)
    .set({ ...parsed.data, updatedAt: new Date(), forfeitReason: req.body?.forfeitReason ? String(req.body.forfeitReason) : null, forfeitRoast: req.body?.forfeitRoast ? String(req.body.forfeitRoast) : null })
    .where(
      and(
        eq(goalsTable.id, params.data.id),
        eq(goalsTable.userId, req.userId!),
      ),
    )
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
});

router.delete("/goals/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteGoalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [goal] = await db
    .delete(goalsTable)
    .where(
      and(
        eq(goalsTable.id, params.data.id),
        eq(goalsTable.userId, req.userId!),
      ),
    )
    .returning();

  if (!goal) {
    res.status(404).json({ error: "Goal not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
