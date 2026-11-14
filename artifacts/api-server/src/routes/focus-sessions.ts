import { awardXpAndCheckBadges, updateStreak } from "../utils/gamification";
import { Router, type IRouter } from "express";
import { and, desc, eq, gte } from "drizzle-orm";
import { db, focusSessionsTable } from "@workspace/db";
import {
  StartFocusSessionBody,
  EndFocusSessionParams,
  EndFocusSessionBody,
  ListFocusSessionsResponse,
  EndFocusSessionResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getUserPlan } from "../lib/plan";
import { ensureSchema } from "../lib/schema-sync";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/focus-sessions", requireAuth, async (req, res): Promise<void> => {
  try {
    await ensureSchema();
    const sessions = await db
      .select()
      .from(focusSessionsTable)
      .where(eq(focusSessionsTable.userId, req.userId!))
      .orderBy(desc(focusSessionsTable.startedAt));

    res.json(ListFocusSessionsResponse.parse(sessions));
  } catch (err: any) {
    logger.error({ err: err?.message ?? err }, "[focus] list failed");
    res.status(500).json({ error: "Could not load your focus sessions." });
  }
});

router.post("/focus-sessions", requireAuth, async (req, res): Promise<void> => {
  try {
    await ensureSchema();

    const parsed = StartFocusSessionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const planInfo = await getUserPlan(req.userId!);
    if (planInfo.plan === "limited") {
      const maxMin = planInfo.limits.maxFocusMinutes ?? 5;
      if (parsed.data.plannedDurationMinutes > maxMin) {
        res.status(402).json({
          error: `Free plan focus sessions are limited to ${maxMin} minutes. Upgrade to Hadaf Pro for longer sessions.`,
          code: "SUBSCRIPTION_REQUIRED",
        });
        return;
      }
      const recent = await db
        .select({ id: focusSessionsTable.id })
        .from(focusSessionsTable)
        .where(
          and(
            eq(focusSessionsTable.userId, req.userId!),
            gte(focusSessionsTable.startedAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
          ),
        );
      if (recent.length >= (planInfo.limits.maxFocusSessionsPerDay ?? 1)) {
        res.status(402).json({
          error: "You've used today's free focus session. Upgrade to Hadaf Pro for unlimited sessions.",
          code: "SUBSCRIPTION_REQUIRED",
        });
        return;
      }
    }

    const [session] = await db
      .insert(focusSessionsTable)
      .values({ ...parsed.data, userId: req.userId! })
      .returning();

    res.status(201).json(EndFocusSessionResponse.parse(session));
  } catch (err: any) {
    logger.error({ err: err?.message ?? err }, "[focus] start failed");
    res.status(500).json({ error: "Could not start your focus session." });
  }
});

router.post("/focus-sessions/:id/end", requireAuth, async (req, res): Promise<void> => {
  try {
    await ensureSchema();

    const params = EndFocusSessionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = EndFocusSessionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const body = (req.body ?? {}) as { forfeitReason?: unknown; forfeitRoast?: unknown };
    const [session] = await db
      .update(focusSessionsTable)
      .set({
        status: parsed.data.status,
        endedAt: new Date(),
        forfeitReason: body.forfeitReason ? String(body.forfeitReason) : null,
        forfeitRoast: body.forfeitRoast ? String(body.forfeitRoast) : null,
      })
      .where(and(eq(focusSessionsTable.id, params.data.id), eq(focusSessionsTable.userId, req.userId!)))
      .returning();

    if (!session) {
      res.status(404).json({ error: "Focus session not found" });
      return;
    }

    if (parsed.data.status === "completed") {
      await awardXpAndCheckBadges(req.userId!, 50, "focus_session", {
        durationMinutes: session.plannedDurationMinutes,
      });
      await updateStreak(req.userId!);
    }

    res.json(EndFocusSessionResponse.parse(session));
  } catch (err: any) {
    logger.error({ err: err?.message ?? err }, "[focus] end failed");
    res.status(500).json({ error: "Could not end your focus session." });
  }
});

export default router;
