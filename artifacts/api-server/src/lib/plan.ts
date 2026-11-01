import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

/** Free trial length: every feature is unlocked for this many days after signup. */
export const TRIAL_DAYS = 5;
/** After the trial (no Pro subscription) the account is "limited". */
export const LIMITED_MAX_FOCUS_MINUTES = 5;
export const LIMITED_MAX_FOCUS_SESSIONS_PER_DAY = 1;

export type PlanKind = "pro" | "trial" | "limited";

export interface PlanInfo {
  plan: PlanKind;
  isPro: boolean;
  trialEndsAt: string;
  trialDaysLeft: number;
  proExpiresAt: string | null;
  limits: {
    goals: boolean;
    analytics: boolean;
    maxFocusMinutes: number | null;
    maxFocusSessionsPerDay: number | null;
  };
}

interface PlanUser {
  trialStartedAt: Date;
  subscriptionTier: string;
  subscriptionExpiresAt: Date | null;
}

export function computePlan(user: PlanUser, now: Date = new Date()): PlanInfo {
  const trialEnds = new Date(user.trialStartedAt.getTime() + TRIAL_DAYS * 86_400_000);
  const proActive =
    user.subscriptionTier === "pro" &&
    (!user.subscriptionExpiresAt || user.subscriptionExpiresAt.getTime() > now.getTime());
  const trialMsLeft = trialEnds.getTime() - now.getTime();
  const trialDaysLeft = Math.max(0, Math.ceil(trialMsLeft / 86_400_000));
  const plan: PlanKind = proActive ? "pro" : trialMsLeft > 0 ? "trial" : "limited";

  return {
    plan,
    isPro: proActive,
    trialEndsAt: trialEnds.toISOString(),
    trialDaysLeft,
    proExpiresAt: user.subscriptionExpiresAt ? user.subscriptionExpiresAt.toISOString() : null,
    limits:
      plan === "limited"
        ? {
            goals: false,
            analytics: false,
            maxFocusMinutes: LIMITED_MAX_FOCUS_MINUTES,
            maxFocusSessionsPerDay: LIMITED_MAX_FOCUS_SESSIONS_PER_DAY,
          }
        : { goals: true, analytics: true, maxFocusMinutes: null, maxFocusSessionsPerDay: null },
  };
}

export async function getUserPlan(userId: string): Promise<PlanInfo> {
  const [u] = await db
    .select({
      trialStartedAt: usersTable.trialStartedAt,
      subscriptionTier: usersTable.subscriptionTier,
      subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!u) {
    return computePlan({ trialStartedAt: new Date(), subscriptionTier: "free", subscriptionExpiresAt: null });
  }
  return computePlan(u);
}
