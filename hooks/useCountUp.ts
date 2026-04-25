import { useState, useEffect, useRef } from 'react';

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Animates a number from 0 to `target` over `duration` ms after an initial `delay`.
 * Returns the current animated integer value.
 */
export function useCountUp(target: number, duration = 1000, delay = 450): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<ReturnType<typeof requestAnimationFrame>>(0);

  useEffect(() => {
    setValue(0);
    if (target === 0) return;

    const timeout = setTimeout(() => {
      const startTime = Date.now();
      const step = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        setValue(Math.round(target * easeOutCubic(progress)));
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(step);
        }
      };
      rafRef.current = requestAnimationFrame(step);
    }, delay);

    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, delay]);

  return value;
}
