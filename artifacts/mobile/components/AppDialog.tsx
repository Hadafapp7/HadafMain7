import { MaterialIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

/**
 * In-app replacement for the system `Alert.alert` pop-up.
 * Fully rendered with React Native (no Android AlertDialog) and animated with Reanimated.
 *
 *   const dialog = useDialog();
 *   dialog.alert("Title", "Message", [{ text: "Cancel", style: "cancel" }, { text: "OK", onPress }]);
 *   dialog.show({ title, message, tone: "success", actions: [...] });
 */

export type DialogTone = "info" | "success" | "warning" | "danger" | "pro";

export interface DialogAction {
  text: string;
  /** "primary" = filled black pill, "cancel" = quiet text button, "destructive" = red pill. */
  style?: "primary" | "cancel" | "destructive" | "default";
  onPress?: () => void;
}

export interface DialogOptions {
  title: string;
  message?: string;
  tone?: DialogTone;
  actions?: DialogAction[];
  /** Tap on the backdrop / hardware back closes the dialog (default true). */
  dismissable?: boolean;
}

interface DialogApi {
  show: (options: DialogOptions) => void;
  /** Drop-in for `Alert.alert(title, message, buttons)`. */
  alert: (title: string, message?: string, actions?: DialogAction[], tone?: DialogTone) => void;
}

const EXIT_MS = 170;

const TONES: Record<DialogTone, { icon: React.ComponentProps<typeof MaterialIcons>["name"]; bg: string; fg: string }> = {
  info:    { icon: "info-outline",       bg: "#eef2ff", fg: "#3b4fd8" },
  success: { icon: "check",              bg: "#e8f7ee", fg: "#15803d" },
  warning: { icon: "warning-amber",      bg: "#fff4e5", fg: "#c2610c" },
  danger:  { icon: "error-outline",      bg: "#fdeceb", fg: "#ba1a1a" },
  pro:     { icon: "bolt",               bg: "#0a0a0a", fg: "#ffffff" },
};

const noopApi: DialogApi = { show: () => {}, alert: () => {} };
const DialogContext = createContext<DialogApi>(noopApi);

let globalShow: ((o: DialogOptions) => void) | null = null;
/** Imperative access for non-component code. Safe no-op until the provider has mounted. */
export function showDialog(options: DialogOptions) {
  globalShow?.(options);
}

function inferTone(title: string, actions?: DialogAction[]): DialogTone {
  const t = title.toLowerCase();
  if (/pro|upgrade|unlock/.test(t) && !/not completed/.test(t)) return "pro";
  if (/not completed|failed|error|wrong|invalid|couldn/.test(t)) return "danger";
  if (/limit|enable|permission|nothing/.test(t)) return "warning";
  if (/you're|restored|success|saved|done|thank/.test(t)) return "success";
  return actions && actions.length > 1 ? "warning" : "info";
}

function DialogCard({ options, visible, onAction, onBackdrop }: {
  options: DialogOptions;
  visible: boolean;
  onAction: (a: DialogAction) => void;
  onBackdrop: () => void;
}) {
  const progress = useSharedValue(0);
  const iconScale = useSharedValue(0);
  const ring = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      progress.value = withSpring(1, { damping: 15, stiffness: 190, mass: 0.8 });
      iconScale.value = 0;
      iconScale.value = withDelay(110, withSpring(1, { damping: 8, stiffness: 190 }));
      ring.value = 0;
      ring.value = withDelay(160, withSequence(withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 0 })));
    } else {
      progress.value = withTiming(0, { duration: EXIT_MS, easing: Easing.in(Easing.quad) });
    }
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, progress.value)) }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value * 1.6),
    transform: [{ translateY: (1 - progress.value) * 28 }, { scale: 0.88 + 0.12 * progress.value }],
  }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconScale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - ring.value) * 0.5,
    transform: [{ scale: 1 + ring.value * 0.9 }],
  }));

  const tone = TONES[options.tone ?? "info"];
  const actions: DialogAction[] = options.actions?.length ? options.actions : [{ text: "OK", style: "primary" }];
  const stacked = actions.length > 2;

  return (
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        {Platform.OS === "ios" ? <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} /> : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(10,10,10,0.55)" }]} />
      </Animated.View>
      <Pressable style={StyleSheet.absoluteFill} onPress={onBackdrop} />

      <Animated.View style={[styles.card, cardStyle]}>
        <View style={styles.iconWrap}>
          <Animated.View style={[styles.pulse, { backgroundColor: tone.bg }, ringStyle]} />
          <Animated.View style={[styles.iconCircle, { backgroundColor: tone.bg }, iconStyle]}>
            <MaterialIcons name={tone.icon} size={30} color={tone.fg} />
          </Animated.View>
        </View>

        <Text style={styles.title}>{options.title}</Text>
        {options.message ? <Text style={styles.message}>{options.message}</Text> : null}

        <View style={[styles.actions, stacked ? { flexDirection: "column" } : { flexDirection: "row" }]}>
          {actions.map((a, i) => {
            const kind =
              a.style === "cancel" ? "cancel"
              : a.style === "destructive" ? "destructive"
              : a.style === "primary" ? "primary"
              : i === actions.length - 1 ? "primary" : "cancel";
            return (
              <TouchableOpacity
                key={`${a.text}-${i}`}
                activeOpacity={0.85}
                style={[
                  styles.btn,
                  !stacked && { flex: 1 },
                  kind === "primary" && { backgroundColor: "#0a0a0a" },
                  kind === "destructive" && { backgroundColor: "#ba1a1a" },
                  kind === "cancel" && { backgroundColor: "#f1f1f1" },
                ]}
                onPress={() => onAction(a)}
              >
                <Text style={[styles.btnText, kind === "cancel" && { color: "#3f3f46" }]}>{a.text}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<DialogOptions | null>(null);
  const [visible, setVisible] = useState(false);
  const queue = useRef<DialogOptions[]>([]);
  const busy = useRef(false);
  const closing = useRef(false);

  const presentNext = useCallback(() => {
    const next = queue.current.shift();
    if (!next) {
      busy.current = false;
      return;
    }
    busy.current = true;
    closing.current = false;
    setCurrent(next);
    setVisible(true);
    const t = next.tone ?? "info";
    if (Platform.OS !== "web") {
      if (t === "danger") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      else if (t === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, []);

  const show = useCallback((options: DialogOptions) => {
    queue.current.push(options);
    if (!busy.current) presentNext();
  }, [presentNext]);

  const dismiss = useCallback((action?: DialogAction) => {
    if (closing.current) return;
    closing.current = true;
    setVisible(false);
    setTimeout(() => {
      setCurrent(null);
      try {
        action?.onPress?.();
      } finally {
        presentNext();
      }
    }, EXIT_MS);
  }, [presentNext]);

  const alert = useCallback<DialogApi["alert"]>((title, message, actions, tone) => {
    show({ title, message, actions, tone: tone ?? inferTone(title, actions) });
  }, [show]);

  useEffect(() => {
    globalShow = show;
    return () => {
      if (globalShow === show) globalShow = null;
    };
  }, [show]);

  const api = useMemo<DialogApi>(() => ({ show, alert }), [show, alert]);

  const onBackdrop = useCallback(() => {
    if (!current || current.dismissable === false) return;
    const cancel = current.actions?.find((a) => a.style === "cancel");
    dismiss(cancel);
  }, [current, dismiss]);

  return (
    <DialogContext.Provider value={api}>
      {children}
      <Modal
        visible={current !== null}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={onBackdrop}
      >
        {current ? (
          <DialogCard options={current} visible={visible} onAction={dismiss} onBackdrop={onBackdrop} />
        ) : null}
      </Modal>
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogApi {
  return useContext(DialogContext);
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#ffffff",
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22,
    shadowRadius: 32,
    elevation: 16,
  },
  iconWrap: { width: 72, height: 72, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  pulse: { position: "absolute", width: 64, height: 64, borderRadius: 32 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 19, fontFamily: "Inter_700Bold", color: "#0a0a0a", textAlign: "center", letterSpacing: -0.3 },
  message: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#52525b",
    textAlign: "center",
    lineHeight: 21,
    marginTop: 8,
  },
  actions: { alignSelf: "stretch", gap: 10, marginTop: 22 },
  btn: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  btnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#ffffff", letterSpacing: 0.3 },
});

