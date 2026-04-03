export const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

export const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

export const formatTime = (totalSeconds: number): string => {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const formatDate = (date: Date): string =>
  date.toLocaleDateString('en-IN', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

export const getLevelName = (level: number): string => {
  const names = [
    'Beginner', 'Explorer', 'Focused', 'Focused Mind', 'Deep Worker',
    'Flow State', 'Clarity Master', 'Peak Performer', 'Elite', 'Legend',
  ];
  return names[Math.min(level - 1, names.length - 1)];
};
