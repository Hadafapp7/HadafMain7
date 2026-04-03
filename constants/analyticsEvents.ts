export const EVENTS = {
  USER_SIGNED_UP:            'user_signed_up',
  USER_LOGGED_IN:            'user_logged_in',
  USER_LOGGED_OUT:           'user_logged_out',
  ONBOARDING_COMPLETED:      'onboarding_completed',
  ONBOARDING_SKIPPED:        'onboarding_skipped',
  FOCUS_SESSION_STARTED:     'focus_session_started',
  FOCUS_SESSION_COMPLETED:   'focus_session_completed',
  FOCUS_SESSION_ENDED_EARLY: 'focus_session_ended_early',
  TASK_CREATED:              'task_created',
  TASK_COMPLETED:            'task_completed',
  ALL_TASKS_COMPLETED:       'all_tasks_completed',
  MOOD_CHECKIN_SAVED:        'mood_checkin_saved',
  PAYWALL_VIEWED:            'paywall_viewed',
  SUBSCRIPTION_STARTED:      'subscription_started',
  FEATURE_USED:              'feature_used',
} as const;

export type AnalyticsEvent = (typeof EVENTS)[keyof typeof EVENTS];
