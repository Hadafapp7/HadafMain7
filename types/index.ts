import type { Session, User } from '@supabase/supabase-js';

export type { Session, User };

export type MoodLevel = 1 | 2 | 3 | 4 | 5;

export const MOOD_LABELS: Record<MoodLevel, string> = {
  1: 'Awful',
  2: 'Bad',
  3: 'Neutral',
  4: 'Good',
  5: 'Great',
};

export const MOOD_EMOJIS: Record<MoodLevel, string> = {
  1: '😩',
  2: '😞',
  3: '😐',
  4: '😊',
  5: '😁',
};

export interface Task {
  id: string;
  user_id: string;
  title: string;
  completed: boolean;
  completed_at: string | null;
  date: string;
  created_at: string;
}

export interface FocusSession {
  id: string;
  user_id: string;
  duration_minutes: number;
  completed: boolean;
  ended_early: boolean;
  xp_earned: number;
  created_at: string;
}

export interface MoodCheckin {
  id: string;
  user_id: string;
  mood: MoodLevel;
  triggers: string[];
  note: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  streak_count: number;
  xp_total: number;
  level: number;
  created_at: string;
  updated_at: string;
}

export type SubscriptionPlan = 'free' | 'monthly' | 'annual';

export interface Entitlements {
  isPremium: boolean;
  plan: SubscriptionPlan;
}
