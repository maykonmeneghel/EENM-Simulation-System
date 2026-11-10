import { useSyncExternalStore } from 'react';

/** Phone-sized screens: the window becomes one column with drawers (styles.css uses the same width). */
export const COMPACT_QUERY = '(max-width: 959px)';

/** Whether a CSS media query matches, updated when it changes (false where matchMedia does not exist, e.g. jsdom). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}
