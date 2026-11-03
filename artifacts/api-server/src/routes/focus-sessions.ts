import { awardXpAndCheckBadges, updateStreak } from "../utils/gamification";
import { Router, type IRouter } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
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

const router: IRouter = Router();

let columnsEnsured = false;
async function ensureFocusColumns() {
  if (columnsEnsured) return;
  try {
    await db.execute(sql`
      ALTER TABLE focus_sessions ADD COLUMN IF NOT EXISTS forfeit_reason text;
      ALTER TABLE focus_sessions ADD COLUMN IF NOT EXISTS forfeit_roast text;
    `);
    columnsEnsured = true;
  } catch {}
}

router.get(
  "/focus-sessions",
  requireAuth,
  async (req, res): Promise<void> => {
    const sessions = await db
      .select()
      .from(focusSessionsTable)
      .where(eq(focusSessionsTable.userId, req.userId!))
      .orderBy(desc(focusSessionsTable.startedAt));

    res.json(ListFocusSessionsResponse.parse(sessions));
  },
);

router.post(
  "/focus-sessions",
  requireAuth,
  async (req, res): Promise<void> => {
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

    await ensureFocusColumns();
    const [session] = await db
      .insert(focusSessionsTable)
      .values({ ...parsed.data, userId: req.userId! })
      .returning();

    res.status(201).json(EndFocusSessionResponse.parse(session));
  },
);

router.post(
  "/focus-sessions/:id/end",
  requireAuth,
  async (req, res): Promise<void> => {
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

    await ensureFocusColumns();
    const [session] = await db
      .update(focusSessionsTable)
      .set({
        status: parsed.data.status,
        endedAt: new Date(),
        forfeitReason: (req.body as any)?.forfeitReason ? String((req.body as any).forfeitReason) : null,
        forfeitRoast: (req.body as any)?.forfeitRoast ? String((req.body as any).forfeitRoast) : null,
      })
      .where(
        and(
          eq(focusSessionsTable.id, params.data.id),
          eq(focusSessionsTable.userId, req.userId!),
        ),
      )
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
  },
);

export default router;
