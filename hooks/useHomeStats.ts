/**
 * useHomeStats — static mock data layer.
 *
 * TODO (Supabase): Replace each hook body with a `useQuery` call that
 * fetches from Supabase once the backend is ready. The return signature
 * { data, isLoading } is intentionally compatible with TanStack Query so
 * the swap requires no changes in the consuming screen.
 */

import { useState } from 'react';
import type { HomeStats, MostUsedApp, QuickAction } from '@/types/home';

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_STATS: HomeStats = {
  screenTimeHours: 4,
  screenTimeMinutes: 32,
  screenTimeChangePercent: 23,
  screenTimeChangeDirection: 'down',
  doomScore: 68,
  doomScoreChange: 4,
};

const MOCK_APPS: MostUsedApp[] = [
  {
    id: '1',
    name: 'Instagram',
    category: 'Social',
    timeDisplay: '2h 15m',
    progressFraction: 0.75,
    iconName: 'photo-camera',
  },
  {
    id: '2',
    name: 'TikTok',
    category: 'Entertainment',
    timeDisplay: '1h 45m',
    progressFraction: 0.5,
    iconName: 'movie',
  },
];

const MOCK_QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'tasks',
    label: 'Daily\nTasks',
    iconName: 'checklist',
    badgeText: '3 Left',
    variant: 'emerald',
    badgeStyle: 'filled',
  },
  {
    id: 'mood',
    label: 'Mood\nCheck',
    iconName: 'self-improvement',
    badgeText: 'Empty',
    variant: 'orange',
    badgeStyle: 'outline',
  },
  {
    id: 'streaks',
    label: 'Streaks',
    iconName: 'local-fire-department',
    badgeText: '7 Days',
    variant: 'orange',
    badgeStyle: 'filled',
  },
];

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useHomeStats() {
  const [data] = useState<HomeStats>(MOCK_STATS);
  return { data, isLoading: false };
}

export function useMostUsedApps() {
  const [data] = useState<MostUsedApp[]>(MOCK_APPS);
  return { data, isLoading: false };
}

export function useQuickActions() {
  const [data] = useState<QuickAction[]>(MOCK_QUICK_ACTIONS);
  return { data, isLoading: false };
}
