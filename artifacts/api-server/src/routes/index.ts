import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import usersRouter from "./users.js";
import goalsRouter from "./goals.js";
import appUsageRouter from "./app-usage.js";
import focusSessionsRouter from "./focus-sessions.js";
import blockedAppsRouter from "./blocked-apps.js";
import userSettingsRouter from "./user-settings.js";
import achievementsRouter from "./achievements.js";
import moodLogsRouter from "./mood-logs.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(goalsRouter);
router.use(appUsageRouter);
router.use(focusSessionsRouter);
router.use(blockedAppsRouter);
router.use(userSettingsRouter);
router.use(achievementsRouter);
router.use(moodLogsRouter);

export default router;
