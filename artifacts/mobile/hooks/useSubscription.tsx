import { useAuth } from "@clerk/expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  getProPackages,
  getPurchasesIssue,
  hasProEntitlement,
  initPurchases,
  logOutPurchases,
  purchasePackage,
  purchasesAvailable,
  restorePurchases,
  type ProPackages,
  type PurchaseResult,
} from "@/lib/purchases";

export type PlanKind = "pro" | "trial" | "limited";
export type BillingPeriod = "monthly" | "annual";

interface ServerStatus {
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

/** A purchasable Pro plan, read from the store (via RevenueCat). */
export interface PlanOption {
  id: BillingPeriod;
  /** Localised price, e.g. "$9.99". */
  priceString: string;
  amount: number | null;
  currency: string | null;
}

interface SubscriptionState {
  /** "loading" until the server answered - treated as unrestricted so the UI never flashes locked. */
  plan: PlanKind | "loading";
  isPro: boolean;
  isTrial: boolean;
  isLimited: boolean;
  trialDaysLeft: number;
  proExpiresAt: string | null;
  canCreateGoals: boolean;
  analyticsLocked: boolean;
  maxFocusMinutes: number | null;
  maxFocusSessionsPerDay: number | null;
  /** Monthly price label (kept for older screens). */
  priceLabel: string;
  /** Plans available to buy right now. `null` = not offered / not loaded. */
  plans: { monthly: PlanOption | null; annual: PlanOption | null };
  purchasesReady: boolean;
  /** Human-readable reason purchases can't be made yet (null when OK). */
  purchasesIssue: string | null;
  purchasing: boolean;
  refresh: () => Promise<void>;
  purchase: (period?: BillingPeriod) => Promise<PurchaseResult>;
  restore: () => Promise<PurchaseResult>;
}

const DEFAULT_STATE: SubscriptionState = {
  plan: "loading",
  isPro: false,
  isTrial: false,
  isLimited: false,
  trialDaysLeft: 0,
  proExpiresAt: null,
  canCreateGoals: true,
  analyticsLocked: false,
  maxFocusMinutes: null,
  maxFocusSessionsPerDay: null,
  priceLabel: "$10.00",
  plans: { monthly: null, annual: null },
  purchasesReady: false,
  purchasesIssue: null,
  purchasing: false,
  refresh: async () => {},
  purchase: async () => ({ success: false, error: "Not ready" }),
  restore: async () => ({ success: false, error: "Not ready" }),
};

const SubscriptionContext = createContext<SubscriptionState>(DEFAULT_STATE);
const STATUS_KEY = ["subscription-status"];

function toPlanOption(id: BillingPeriod, pkg: any | null): PlanOption | null {
  if (!pkg?.product) return null;
  const amount = typeof pkg.product.price === "number" ? pkg.product.price : null;
  return {
    id,
    priceString: String(pkg.product.priceString ?? ""),
    amount,
    currency: pkg.product.currencyCode ?? null,
  };
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, userId } = useAuth();
  const queryClient = useQueryClient();

  const [rcPro, setRcPro] = useState(false);
  const [pkgs, setPkgs] = useState<ProPackages>({ monthly: null, annual: null });
  const [purchasing, setPurchasing] = useState(false);
  const [purchasesIssue, setPurchasesIssue] = useState<string | null>(null);

  const status = useQuery<ServerStatus>({
    queryKey: STATUS_KEY,
    enabled: Boolean(isSignedIn),
    staleTime: 30_000,
    retry: 2,
    queryFn: () => customFetch<ServerStatus>("/api/subscription/status"),
  });

  // Connect RevenueCat to the signed-in Clerk user so webhooks can map purchases back to them.
  useEffect(() => {
    if (!isSignedIn || !userId) {
      setRcPro(false);
      setPkgs({ monthly: null, annual: null });
      void logOutPurchases();
      return;
    }
    let cancelled = false;
    (async () => {
      const ok = await initPurchases(userId);
      if (!ok) {
        if (!cancelled) setPurchasesIssue(getPurchasesIssue());
        return;
      }
      if (cancelled) return;
      setRcPro(await hasProEntitlement());
      const found = await getProPackages();
      if (!cancelled) {
        if (found.monthly || found.annual) {
          setPkgs(found);
          setPurchasesIssue(null);
        } else {
          setPurchasesIssue(getPurchasesIssue());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, userId]);

  const syncServer = useCallback(async () => {
    try {
      await customFetch("/api/subscription/sync", { method: "POST" });
    } catch (e) {
      console.log("[Subscription] sync failed (webhook will catch up):", e);
    }
    await queryClient.invalidateQueries({ queryKey: STATUS_KEY });
  }, [queryClient]);

  const refresh = useCallback(async () => {
    if (purchasesAvailable()) setRcPro(await hasProEntitlement());
    await queryClient.invalidateQueries({ queryKey: STATUS_KEY });
  }, [queryClient]);

  const purchase = useCallback(
    async (period: BillingPeriod = "monthly"): Promise<PurchaseResult> => {
      setPurchasing(true);
      try {
        // Offerings may not have been ready at startup - retry once when the user taps Upgrade.
        let current = pkgs;
        if (!current.monthly && !current.annual) {
          current = await getProPackages();
          if (current.monthly || current.annual) {
            setPkgs(current);
            setPurchasesIssue(null);
          } else {
            setPurchasesIssue(getPurchasesIssue());
          }
        }
        const target = current[period] ?? current.monthly ?? current.annual;
        if (!target) {
          return {
            success: false,
            error: getPurchasesIssue() ?? "Subscriptions aren't available right now. Please try again in a moment.",
          };
        }
        const result = await purchasePackage(target);
        if (result.success) {
          setRcPro(true);
          await syncServer();
        }
        return result;
      } finally {
        setPurchasing(false);
      }
    },
    [pkgs, syncServer],
  );

  const restore = useCallback(async (): Promise<PurchaseResult> => {
    setPurchasing(true);
    try {
      const result = await restorePurchases();
      if (result.success) {
        setRcPro(true);
        await syncServer();
      }
      return result;
    } finally {
      setPurchasing(false);
    }
  }, [syncServer]);

  const value = useMemo<SubscriptionState>(() => {
    const server = status.data;
    const isPro = rcPro || Boolean(server?.isPro);
    const plan: SubscriptionState["plan"] = isPro ? "pro" : server ? server.plan : "loading";
    const isLimited = plan === "limited";
    const monthly = toPlanOption("monthly", pkgs.monthly);
    const annual = toPlanOption("annual", pkgs.annual);
    return {
      plan,
      isPro,
      isTrial: plan === "trial",
      isLimited,
      trialDaysLeft: server?.trialDaysLeft ?? 0,
      proExpiresAt: server?.proExpiresAt ?? null,
      canCreateGoals: !isLimited,
      analyticsLocked: isLimited,
      maxFocusMinutes: isLimited ? server?.limits.maxFocusMinutes ?? 5 : null,
      maxFocusSessionsPerDay: isLimited ? server?.limits.maxFocusSessionsPerDay ?? 1 : null,
      priceLabel: monthly?.priceString || annual?.priceString || "$10.00",
      plans: { monthly, annual },
      purchasesReady: Boolean(pkgs.monthly || pkgs.annual),
      purchasesIssue,
      purchasing,
      refresh,
      purchase,
      restore,
    };
  }, [status.data, rcPro, pkgs, purchasing, purchasesIssue, refresh, purchase, restore]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription(): SubscriptionState {
  return useContext(SubscriptionContext);
}
