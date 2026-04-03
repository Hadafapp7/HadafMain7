export const QUERY_KEYS = {
  profile:       (userId: string)                    => ['profile', userId]           as const,
  tasks:         (userId: string, date: string)      => ['tasks', userId, date]       as const,
  focusSessions: (userId: string)                    => ['focus_sessions', userId]    as const,
  moodCheckins:  (userId: string)                    => ['mood_checkins', userId]     as const,
  analytics:     (userId: string, period: string)    => ['analytics', userId, period] as const,
} as const;
