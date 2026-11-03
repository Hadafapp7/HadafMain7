import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const KEY = "hadaf_onboarding_done_v1";

interface OnboardingState {
  /** null while the saved flag is still loading. */
  done: boolean | null;
  complete: () => Promise<void>;
  /** Shows the intro again on next sign-out (handy for testing). */
  reset: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingState>({
  done: null,
  complete: async () => {},
  reset: async () => {},
});

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [done, setDone] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((v) => alive && setDone(v === "1"))
      .catch(() => alive && setDone(false));
    return () => {
      alive = false;
    };
  }, []);

  const complete = useCallback(async () => {
    setDone(true);
    try {
      await AsyncStorage.setItem(KEY, "1");
    } catch {
      /* the in-memory flag is enough for this session */
    }
  }, []);

  const reset = useCallback(async () => {
    setDone(false);
    try {
      await AsyncStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ done, complete, reset }), [done, complete, reset]);
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  return useContext(OnboardingContext);
}

