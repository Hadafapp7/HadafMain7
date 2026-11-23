import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@clerk/expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  addCustomerInfoUpdateListener,
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
  trialDays?: number;
  trialEndsAt: string;
  trialDaysLeft: number;
  proExpiresAt: string | null;
  pricing?: {
    isIndia: boolean;
    countryCode: string;
    currency: "INR" | "USD";
    monthlyAmount: number;
    monthlyPriceLabel: string;
  };
  limits: {
    goals: boolean;
    analytics: boolean;
    maxFocusMinutes: number | null;
    maxFocusSessionsPerDay: number | null;
  };
}

function detectDeviceIsIndia(): boolean {
  try {
    const opts = Intl.DateTimeFormat().resolvedOptions();
    const tz = String(opts.timeZone ?? "").toLowerCase();
    const locale = String(opts.locale ?? "").toLowerCase();
    return (
      tz === "asia/kolkata" ||
      tz === "asia/calcutta" ||
      locale.endsWith("-in") ||
      locale.endsWith("_in") ||
      locale.includes("-in-")
    );
  } catch {
    return false;
  }
}

const DEVICE_IS_INDIA = detectDeviceIsIndia();
const DEFAULT_REGIONAL_PRICE = DEVICE_IS_INDIA ? "₹299" : "$10";

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
  trialDays: number;
  trialDaysLeft: number;
  proExpiresAt: string | null;
  isIndia: boolean;
  canCreateGoals: boolean;
  analyticsLocked: boolean;
  maxFocusMinutes: number | null;
  maxFocusSessionsPerDay: number | null;
  /** Monthly price label (₹299 in India, $10 internationally). */
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
  trialDays: 15,
  trialDaysLeft: 0,
  proExpiresAt: null,
  isIndia: DEVICE_IS_INDIA,
  canCreateGoals: true,
  analyticsLocked: false,
  maxFocusMinutes: null,
  maxFocusSessionsPerDay: null,
  priceLabel: DEFAULT_REGIONAL_PRICE,
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
    queryFn: () => {
      let tz = "";
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      } catch {}
      return customFetch<ServerStatus>("/api/subscription/status", {
        headers: tz ? { "x-timezone": tz } : undefined,
      });
    },
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
      // Check locally cached sandbox/pro flag for instant activation
      try {
        const cachedPro = await AsyncStorage.getItem(`@hadaf/pro_active_${userId}`);
        if (cachedPro === "true" && !cancelled) {
          setRcPro(true);
        }
      } catch {}

      const livePro = await hasProEntitlement();
      if (!cancelled && livePro) {
        setRcPro(true);
        AsyncStorage.setItem(`@hadaf/pro_active_${userId}`, "true").catch(() => {});
        customFetch("/api/subscription/sync", {
          method: "POST",
          body: JSON.stringify({ clientVerifiedPro: true }),
        }).catch(() => {});
      }
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
    const removeListener = addCustomerInfoUpdateListener((isProNow) => {
      if (!cancelled && isProNow) {
        setRcPro(true);
        if (userId) {
          AsyncStorage.setItem(`@hadaf/pro_active_${userId}`, "true").catch(() => {});
        }
        customFetch("/api/subscription/sync", {
          method: "POST",
          body: JSON.stringify({ clientVerifiedPro: true }),
        })
          .then(() => queryClient.invalidateQueries({ queryKey: STATUS_KEY }))
          .catch(() => {});
      }
    });
    return () => {
      cancelled = true;
      removeListener();
    };
  }, [isSignedIn, userId, queryClient]);

  const syncServer = useCallback(
    async (clientVerifiedPro = false, period: BillingPeriod = "monthly") => {
      // Optimistically set React Query cache to Pro immediately so UI unlocks in <10ms
      if (clientVerifiedPro) {
        if (userId) {
          AsyncStorage.setItem(`@hadaf/pro_active_${userId}`, "true").catch(() => {});
        }
        const days = period === "annual" ? 365 : 30;
        const optimisticStatus: ServerStatus = {
          plan: "pro",
          isPro: true,
          trialEndsAt: new Date().toISOString(),
          trialDaysLeft: 0,
          proExpiresAt: new Date(Date.now() + days * 86_400_000).toISOString(),
          limits: {
            goals: true,
            analytics: true,
            maxFocusMinutes: null,
            maxFocusSessionsPerDay: null,
          },
        };
        queryClient.setQueryData(STATUS_KEY, optimisticStatus);
      }
      try {
        await customFetch("/api/subscription/sync", {
          method: "POST",
          body: JSON.stringify({ clientVerifiedPro, period }),
        });
      } catch (e) {
        console.log("[Subscription] sync failed (webhook will catch up):", e);
      }
      await queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
    [queryClient, userId],
  );

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
          await syncServer(true, period);
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
        await syncServer(true, "monthly");
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
    const isIndia = server?.pricing ? server.pricing.isIndia : DEVICE_IS_INDIA;
    const regionalFallbackPrice = server?.pricing?.monthlyPriceLabel || (isIndia ? "₹299" : "$10");
    return {
      plan,
      isPro,
      isTrial: plan === "trial",
      isLimited,
      trialDays: server?.trialDays ?? 15,
      trialDaysLeft: server?.trialDaysLeft ?? 0,
      proExpiresAt: server?.proExpiresAt ?? null,
      isIndia,
      canCreateGoals: !isLimited,
      analyticsLocked: isLimited,
      maxFocusMinutes: isLimited ? server?.limits.maxFocusMinutes ?? 5 : null,
      maxFocusSessionsPerDay: isLimited ? server?.limits.maxFocusSessionsPerDay ?? 1 : null,
      priceLabel: monthly?.priceString || regionalFallbackPrice,
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
