import { awardXpAndCheckBadges, updateStreak } from "../utils/gamification";
import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, focusSessionsTable } from "@workspace/db";
import {
  StartFocusSessionBody,
  EndFocusSessionParams,
  EndFocusSessionBody,
  ListFocusSessionsResponse,
  EndFocusSessionResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

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

    const [session] = await db
      .update(focusSessionsTable)
      .set({ status: parsed.data.status, endedAt: new Date() })
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
