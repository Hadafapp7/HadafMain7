export interface HomeStats {
  screenTimeHours: number;
  screenTimeMinutes: number;
  screenTimeChangePercent: number;
  screenTimeChangeDirection: 'up' | 'down';
  doomScore: number;
  doomScoreChange: number;
}

export interface MostUsedApp {
  id: string;
  name: string;
  category: string;
  timeDisplay: string;
  progressFraction: number;
  iconName: string;
}

export type QuickActionVariant = 'emerald' | 'orange';
export type QuickActionBadgeStyle = 'filled' | 'outline';

export interface QuickAction {
  id: string;
  label: string;
  iconName: string;
  badgeText: string;
  variant: QuickActionVariant;
  badgeStyle: QuickActionBadgeStyle;
}
