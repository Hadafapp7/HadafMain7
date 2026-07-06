import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import goalsRouter from "./goals";
import appUsageRouter from "./app-usage";
import focusSessionsRouter from "./focus-sessions";
import blockedAppsRouter from "./blocked-apps";
import userSettingsRouter from "./user-settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(goalsRouter);
router.use(appUsageRouter);
router.use(focusSessionsRouter);
router.use(blockedAppsRouter);
router.use(userSettingsRouter);

export default router;
