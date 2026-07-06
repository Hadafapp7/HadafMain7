import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, userSettingsTable } from "@workspace/db";
import {
  UpdateUserSettingsBody,
  GetUserSettingsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get(
  "/user-settings",
  requireAuth,
  async (req, res): Promise<void> => {
    const [existing] = await db
      .select()
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, req.userId!));

    if (existing) {
      res.json(GetUserSettingsResponse.parse(existing));
      return;
    }

    const [created] = await db
      .insert(userSettingsTable)
      .values({ userId: req.userId! })
      .onConflictDoNothing()
      .returning();

    if (created) {
      res.json(GetUserSettingsResponse.parse(created));
      return;
    }

    const [settings] = await db
      .select()
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, req.userId!));

    res.json(GetUserSettingsResponse.parse(settings));
  },
);

router.patch(
  "/user-settings",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = UpdateUserSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    await db
      .insert(userSettingsTable)
      .values({ userId: req.userId! })
      .onConflictDoNothing();

    const [settings] = await db
      .update(userSettingsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(userSettingsTable.userId, req.userId!))
      .returning();

    res.json(GetUserSettingsResponse.parse(settings));
  },
);

export default router;
