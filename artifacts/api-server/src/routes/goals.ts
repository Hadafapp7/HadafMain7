import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
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

const router: IRouter = Router();

router.get("/goals", requireAuth, async (req, res): Promise<void> => {
  const goals = await db
    .select()
    .from(goalsTable)
    .where(eq(goalsTable.userId, req.userId!))
    .orderBy(goalsTable.createdAt);

  res.json(ListGoalsResponse.parse(goals));
});

router.post("/goals", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateGoalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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
    .set({ ...parsed.data, updatedAt: new Date() })
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

  res.json(UpdateGoalResponse.parse(goal));
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
