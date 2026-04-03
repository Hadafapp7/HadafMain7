export const APP_CONFIG = {
  name: 'Hadaf',
  version: '1.0.0',
  supportEmail: 'support@hadaf.app',
} as const;

export const FOCUS_DURATIONS = [15, 25, 45, 60] as const;
export type FocusDuration = (typeof FOCUS_DURATIONS)[number];

export const XP_REWARDS = {
  TASK_COMPLETED:        10,
  ALL_TASKS_COMPLETED:   50,
  FOCUS_SESSION:         30,
  MOOD_CHECKIN:           5,
} as const;

export const TRIGGER_TAGS = [
  'Comparison', 'FOMO', 'Boredom', 'Loneliness',
  'Procrastination', 'Habit', 'Anxiety', 'Curiosity',
] as const;

export type TriggerTag = (typeof TRIGGER_TAGS)[number];
