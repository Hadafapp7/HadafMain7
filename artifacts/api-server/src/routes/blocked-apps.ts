import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, blockedAppsTable } from "@workspace/db";
import {
  AddBlockedAppBody,
  RemoveBlockedAppParams,
  ListBlockedAppsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/blocked-apps", requireAuth, async (req, res): Promise<void> => {
  const apps = await db
    .select()
    .from(blockedAppsTable)
    .where(eq(blockedAppsTable.userId, req.userId!))
    .orderBy(blockedAppsTable.createdAt);

  res.json(ListBlockedAppsResponse.parse(apps));
});

router.post("/blocked-apps", requireAuth, async (req, res): Promise<void> => {
  const parsed = AddBlockedAppBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [app] = await db
    .insert(blockedAppsTable)
    .values({ ...parsed.data, userId: req.userId! })
    .returning();

  res.status(201).json(app);
});

router.delete(
  "/blocked-apps/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = RemoveBlockedAppParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [app] = await db
      .delete(blockedAppsTable)
      .where(
        and(
          eq(blockedAppsTable.id, params.data.id),
          eq(blockedAppsTable.userId, req.userId!),
        ),
      )
      .returning();

    if (!app) {
      res.status(404).json({ error: "Blocked app not found" });
      return;
    }

    res.sendStatus(204);
  },
);

export default router;
