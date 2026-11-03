import { useEffect, useState } from "react";

type Listener = (active: boolean) => void;

let isSessionActive = false;
const listeners = new Set<Listener>();

export const focusSessionState = {
  get isActive() {
    return isSessionActive;
  },
  setActive(active: boolean) {
    if (isSessionActive !== active) {
      isSessionActive = active;
      listeners.forEach((fn) => {
        try {
          fn(active);
        } catch (e) {
          console.warn("[FocusSessionState] Listener error:", e);
        }
      });
    }
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useIsFocusSessionActive(): boolean {
  const [active, setActive] = useState<boolean>(focusSessionState.isActive);

  useEffect(() => {
    setActive(focusSessionState.isActive);
    return focusSessionState.subscribe(setActive);
  }, []);

  return active;
}
