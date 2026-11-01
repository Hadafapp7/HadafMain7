import { Platform } from "react-native";

/**
 * Thin, crash-proof wrapper around RevenueCat (react-native-purchases).
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
 * Checks whether customer info has an active Pro entitlement or active subscription.
 * Handles both "hadaf_pro" and "pro", any case, and Test Store subscriptions.
 */
export function isCustomerInfoPro(customerInfo: any): boolean {
  if (!customerInfo) return false;

  const activeEntitlements = customerInfo.entitlements?.active ?? {};
  
  // 1. Exact match on configured entitlement ID ("hadaf_pro")
  if (activeEntitlements[ENTITLEMENT_ID]?.isActive) return true;
  if (activeEntitlements[ENTITLEMENT_ID]) return true;

  // 2. Fallback check for "pro" or anything containing "pro"
  if (activeEntitlements["pro"]?.isActive || activeEntitlements["pro"]) return true;
  if (activeEntitlements["hadaf_pro"]?.isActive || activeEntitlements["hadaf_pro"]) return true;

  const activeKeys = Object.keys(activeEntitlements);
  const proKey = activeKeys.find((k) => k.toLowerCase().includes("pro"));
  if (proKey && activeEntitlements[proKey]?.isActive !== false) {
    return true;
  }

  // 3. Any active entitlement at all
  if (activeKeys.length > 0) return true;

  // 4. Any active subscription in Test Store / Google Play
  if (Array.isArray(customerInfo.activeSubscriptions) && customerInfo.activeSubscriptions.length > 0) {
    return true;
  }

  return false;
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

/** The monthly Pro package of the current offering (falls back to the first package found). */
export async function getProPackage(): Promise<any | null> {
  if (!configured) return null;
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

    const pickFrom = (o: any) => o?.monthly ?? o?.availablePackages?.[0] ?? null;
    const pkg = pickFrom(current) ?? allOfferings.map(pickFrom).find(Boolean) ?? null;

    if (!pkg) {
      lastIssue =
        "RevenueCat has no package to sell. In the RevenueCat dashboard: Product catalog -> Offerings -> make an offering 'Current' and add a Monthly package.";
      console.log("[Purchases]", lastIssue);
      return null;
    }
    lastIssue = null;
    console.log("[Purchases] Using package", pkg.identifier, "-> product", pkg.product?.identifier, pkg.product?.priceString);
    return pkg;
  } catch (e: any) {
    lastIssue = "Couldn't load products from RevenueCat: " + (e?.message ?? String(e));
    console.log("[Purchases] getOfferings failed:", e);
    return null;
  }
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
        error: "Purchase registered, but 'hadaf_pro' entitlement was not found on your RevenueCat customer info.",
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
