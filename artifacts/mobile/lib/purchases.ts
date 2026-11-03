import { Platform } from "react-native";

/**
 * Thin, crash-proof wrapper around RevenueCat (react-native-purchases).
 * Every function degrades gracefully when the native module isn't in the installed
 * build (Expo Go / an old dev-client) or no API key is configured, and records a
 * human-readable reason (getPurchasesIssue) so the UI can tell you exactly what is wrong.
 */
let Purchases: any = null;
try {
  Purchases = require("react-native-purchases").default;
} catch {
  console.log("[Purchases] react-native-purchases is not linked in this build");
}

// Must be referenced statically so Expo can inline them at bundle time.
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
/** Optional RevenueCat Test Store key (starts with "test_"). Only ever used in development builds. */
const TEST_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY;
export const ENTITLEMENT_ID = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID || "hadaf_pro";

const apiKey = (): string | undefined => {
  if (__DEV__ && TEST_KEY) return TEST_KEY;
  return Platform.OS === "ios" ? IOS_KEY : ANDROID_KEY;
};

let configured = false;
let lastIssue: string | null = null;

/** Why purchases are unavailable right now (null when everything is fine). */
export function getPurchasesIssue(): string | null {
  return lastIssue;
}

export function purchasesAvailable(): boolean {
  if (!Purchases) {
    lastIssue =
      "The in-app purchase module isn't in this app build. Rebuild the dev client: npx expo run:android (or eas build --profile development).";
    return false;
  }
  if (Platform.OS === "web") {
    lastIssue = "In-app purchases are not supported on web.";
    return false;
  }
  if (!apiKey()) {
    lastIssue =
      "No RevenueCat API key found. Set EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY in artifacts/mobile/.env.local and restart Expo with: npx expo start --dev-client -c";
    return false;
  }
  return true;
}

/**
 * Checks whether customer info has an active Pro entitlement.
 * Handles both "hadaf_pro" and "pro", any case.
 */
export function isCustomerInfoPro(customerInfo: any): boolean {
  if (!customerInfo) return false;

  const activeEntitlements = customerInfo.entitlements?.active ?? {};

  // 1. Exact match on configured entitlement ID ("hadaf_pro")
  if (activeEntitlements[ENTITLEMENT_ID]) return true;

  // 2. Fallback check for "pro" / "hadaf_pro" or anything containing "pro"
  if (activeEntitlements["pro"] || activeEntitlements["hadaf_pro"]) return true;

  const activeKeys = Object.keys(activeEntitlements);
  const proKey = activeKeys.find((k) => k.toLowerCase().includes("pro"));
  if (proKey && activeEntitlements[proKey]?.isActive !== false) return true;

  // 3. Any active entitlement at all
  return activeKeys.length > 0;
}

export async function initPurchases(appUserId: string): Promise<boolean> {
  if (!purchasesAvailable()) {
    console.log("[Purchases] unavailable:", lastIssue);
    return false;
  }
  try {
    if (!configured) {
      try {
        Purchases.setLogLevel?.(Purchases.LOG_LEVEL?.DEBUG ?? "DEBUG");
      } catch {
        /* log level is optional */
      }
      Purchases.configure({ apiKey: apiKey(), appUserID: appUserId });
      configured = true;
      console.log("[Purchases] Configured RevenueCat for user", appUserId, "with key", String(apiKey()).slice(0, 8) + "...");
    } else {
      await Purchases.logIn(appUserId);
    }
    lastIssue = null;
    return true;
  } catch (e: any) {
    lastIssue = "RevenueCat could not start: " + (e?.message ?? String(e));
    console.log("[Purchases] init failed:", e);
    return false;
  }
}

export async function logOutPurchases(): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch {
    /* already anonymous */
  }
}

export async function hasProEntitlement(): Promise<boolean> {
  if (!configured) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return isCustomerInfoPro(info);
  } catch (e) {
    console.log("[Purchases] getCustomerInfo failed:", e);
    return false;
  }
}

export interface ProPackages {
  monthly: any | null;
  annual: any | null;
}

function findPackage(offering: any, kind: "monthly" | "annual"): any | null {
  if (!offering) return null;
  const direct = kind === "monthly" ? offering.monthly : offering.annual;
  if (direct) return direct;
  const list: any[] = offering.availablePackages ?? [];
  const type = kind === "monthly" ? "MONTHLY" : "ANNUAL";
  const re = kind === "monthly" ? /month/i : /year|annual/i;
  return (
    list.find((p) => p?.packageType === type) ??
    list.find((p) => re.test(String(p?.identifier ?? "")) || re.test(String(p?.product?.identifier ?? ""))) ??
    null
  );
}

/** The monthly and yearly Pro packages of the current offering (whichever exist). */
export async function getProPackages(): Promise<ProPackages> {
  const none: ProPackages = { monthly: null, annual: null };
  if (!configured) return none;
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings?.current;
    const allOfferings = Object.values(offerings?.all ?? {}) as any[];
    console.log(
      "[Purchases] Offerings:",
      "current =",
      current?.identifier ?? "none",
      "| all =",
      Object.keys(offerings?.all ?? {}).join(", ") || "none",
    );

    const candidates = [current, ...allOfferings].filter(Boolean);
    let monthly: any = null;
    let annual: any = null;
    for (const o of candidates) {
      monthly = monthly ?? findPackage(o, "monthly");
      annual = annual ?? findPackage(o, "annual");
      if (monthly && annual) break;
    }
    if (!monthly && !annual) {
      // Last resort: sell whatever the first available package is.
      const any = candidates.map((o: any) => o?.availablePackages?.[0]).find(Boolean) ?? null;
      monthly = any;
    }

    if (!monthly && !annual) {
      lastIssue =
        "RevenueCat has no package to sell. In the RevenueCat dashboard: Product catalog -> Offerings -> make an offering 'Current' and add a Monthly package.";
      console.log("[Purchases]", lastIssue);
      return none;
    }
    lastIssue = null;
    console.log(
      "[Purchases] Packages ->",
      monthly ? `monthly ${monthly.identifier} ${monthly.product?.priceString}` : "no monthly",
      "|",
      annual ? `annual ${annual.identifier} ${annual.product?.priceString}` : "no annual",
    );
    return { monthly, annual };
  } catch (e: any) {
    lastIssue = "Couldn't load products from RevenueCat: " + (e?.message ?? String(e));
    console.log("[Purchases] getOfferings failed:", e);
    return none;
  }
}

/** The monthly Pro package of the current offering (falls back to the yearly one). */
export async function getProPackage(): Promise<any | null> {
  const { monthly, annual } = await getProPackages();
  return monthly ?? annual ?? null;
}

export interface PurchaseResult {
  success: boolean;
  cancelled?: boolean;
  error?: string;
}

export async function purchasePackage(pkg: any): Promise<PurchaseResult> {
  if (!configured) return { success: false, error: lastIssue ?? "Purchases are not available in this build." };
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isPro = isCustomerInfoPro(customerInfo);
    console.log("[Purchases] purchasePackage completed. isPro:", isPro, {
      entitlements: Object.keys(customerInfo?.entitlements?.active ?? {}),
      subscriptions: customerInfo?.activeSubscriptions,
    });
    if (!isPro) {
      return {
        success: false,
        error: "Purchase registered, but the 'hadaf_pro' entitlement was not found on your RevenueCat customer info.",
      };
    }
    return { success: true };
  } catch (e: any) {
    if (e?.userCancelled) return { success: false, cancelled: true };
    console.log("[Purchases] purchase failed:", e);
    return { success: false, error: e?.message ?? "Purchase failed" };
  }
}

export async function restorePurchases(): Promise<PurchaseResult> {
  if (!configured) return { success: false, error: lastIssue ?? "Purchases are not available in this build." };
  try {
    const info = await Purchases.restorePurchases();
    const isPro = isCustomerInfoPro(info);
    return {
      success: isPro,
      error: isPro ? undefined : "No active subscription found to restore.",
    };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Restore failed" };
  }
}
