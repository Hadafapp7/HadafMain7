import { useAuth } from "@clerk/expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  getProPackage,
  getPurchasesIssue,
  hasProEntitlement,
  initPurchases,
  logOutPurchases,
  purchasePackage,
  purchasesAvailable,
  restorePurchases,
  type PurchaseResult,
} from "@/lib/purchases";

export type PlanKind = "pro" | "trial" | "limited";

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
  priceLabel: string;
  purchasesReady: boolean;
  /** Human-readable reason purchases can't be made yet (null when OK). */
  purchasesIssue: string | null;
  purchasing: boolean;
  refresh: () => Promise<void>;
  purchase: () => Promise<PurchaseResult>;
  restore: () => Promise<PurchaseResult>;
  testPlan: (plan: "pro" | "trial" | "limited") => Promise<void>;
}

const noop = async () => {};
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
  purchasesReady: false,
  purchasesIssue: null,
  purchasing: false,
  refresh: noop,
  purchase: async () => ({ success: false, error: "Not ready" }),
  restore: async () => ({ success: false, error: "Not ready" }),
  testPlan: noop,
};

const SubscriptionContext = createContext<SubscriptionState>(DEFAULT_STATE);
const STATUS_KEY = ["subscription-status"];

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, userId } = useAuth();
  const queryClient = useQueryClient();

  const [rcPro, setRcPro] = useState(false);
  const [pkg, setPkg] = useState<any>(null);
  const [priceLabel, setPriceLabel] = useState("$10.00");
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
      setPkg(null);
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
      const p = await getProPackage();
      if (!cancelled) {
        if (p) {
          setPkg(p);
          setPurchasesIssue(null);
          if (p.product?.priceString) setPriceLabel(p.product.priceString);
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

  
  const testPlan = useCallback(async (targetPlan: "pro" | "trial" | "limited") => {
    try {
      await customFetch("/api/subscription/test-plan", {
        method: "POST",
        body: JSON.stringify({ plan: targetPlan }),
      });
      await queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    } catch (e) {
      console.log("[Subscription] testPlan failed:", e);
    }
  }, [queryClient]);

  const purchase = useCallback(async (): Promise<PurchaseResult> => {
    setPurchasing(true);
    try {
      // Offerings may not have been ready at startup - retry once when the user taps Upgrade.
      let target = pkg;
      if (!target) {
        target = await getProPackage();
        if (target) {
          setPkg(target);
          setPurchasesIssue(null);
        } else {
          setPurchasesIssue(getPurchasesIssue());
        }
      }
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
  }, [pkg, syncServer]);

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
      priceLabel,
      purchasesReady: Boolean(pkg),
      purchasesIssue,
      purchasing,
      refresh,
      purchase,
      restore,
      testPlan,
    };
  }, [status.data, rcPro, priceLabel, pkg, purchasing, purchasesIssue, refresh, purchase, restore, testPlan]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription(): SubscriptionState {
  return useContext(SubscriptionContext);
}
