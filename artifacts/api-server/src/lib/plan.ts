import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

/** Free trial length: every feature is unlocked for this many days after signup. */
export const TRIAL_DAYS = 15;
/** After the trial (no Pro subscription) the account is "limited". */
export const LIMITED_MAX_FOCUS_MINUTES = 5;
export const LIMITED_MAX_FOCUS_SESSIONS_PER_DAY = 1;

export const INDIA_MONTHLY_PRICE_INR = 299;
export const GLOBAL_MONTHLY_PRICE_USD = 10;

export type PlanKind = "pro" | "trial" | "limited";

export interface RegionalPricing {
  isIndia: boolean;
  countryCode: string;
  currency: "INR" | "USD";
  monthlyAmount: number;
  monthlyPriceLabel: string;
}

export interface PlanInfo {
  plan: PlanKind;
  isPro: boolean;
  trialDays: number;
  trialEndsAt: string;
  trialDaysLeft: number;
  proExpiresAt: string | null;
  pricing: RegionalPricing;
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

export function resolveRegionalPricing(opts?: {
  countryHeader?: string | null;
  timezoneHeader?: string | null;
  acceptLanguage?: string | null;
}): RegionalPricing {
  const cc = (opts?.countryHeader ?? "").trim().toUpperCase();
  const tz = (opts?.timezoneHeader ?? "").trim().toLowerCase();
  const lang = (opts?.acceptLanguage ?? "").trim().toLowerCase();

  const isIndia =
    cc === "IN" ||
    tz === "asia/kolkata" ||
    tz === "asia/calcutta" ||
    lang.includes("-in") ||
    lang.includes("_in");

  if (isIndia) {
    return {
      isIndia: true,
      countryCode: "IN",
      currency: "INR",
      monthlyAmount: INDIA_MONTHLY_PRICE_INR,
      monthlyPriceLabel: `₹${INDIA_MONTHLY_PRICE_INR}`,
    };
  }
  return {
    isIndia: false,
    countryCode: cc || "US",
    currency: "USD",
    monthlyAmount: GLOBAL_MONTHLY_PRICE_USD,
    monthlyPriceLabel: `$${GLOBAL_MONTHLY_PRICE_USD}`,
  };
}

export function computePlan(
  user: PlanUser,
  now: Date = new Date(),
  regionHints?: { countryHeader?: string | null; timezoneHeader?: string | null; acceptLanguage?: string | null },
): PlanInfo {
  const trialEnds = new Date(user.trialStartedAt.getTime() + TRIAL_DAYS * 86_400_000);
  const proActive =
    user.subscriptionTier === "pro" &&
    (!user.subscriptionExpiresAt || user.subscriptionExpiresAt.getTime() > now.getTime());
  const trialMsLeft = trialEnds.getTime() - now.getTime();
  const trialDaysLeft = Math.max(0, Math.ceil(trialMsLeft / 86_400_000));
  const plan: PlanKind = proActive ? "pro" : trialMsLeft > 0 ? "trial" : "limited";
  const pricing = resolveRegionalPricing(regionHints);

  return {
    plan,
    isPro: proActive,
    trialDays: TRIAL_DAYS,
    trialEndsAt: trialEnds.toISOString(),
    trialDaysLeft,
    proExpiresAt: user.subscriptionExpiresAt ? user.subscriptionExpiresAt.toISOString() : null,
    pricing,
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

export async function getUserPlan(
  userId: string,
  regionHints?: { countryHeader?: string | null; timezoneHeader?: string | null; acceptLanguage?: string | null },
): Promise<PlanInfo> {
  const [u] = await db
    .select({
      trialStartedAt: usersTable.trialStartedAt,
      subscriptionTier: usersTable.subscriptionTier,
      subscriptionExpiresAt: usersTable.subscriptionExpiresAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!u) {
    return computePlan(
      { trialStartedAt: new Date(), subscriptionTier: "free", subscriptionExpiresAt: null },
      new Date(),
      regionHints,
    );
  }
  return computePlan(u, new Date(), regionHints);
}
