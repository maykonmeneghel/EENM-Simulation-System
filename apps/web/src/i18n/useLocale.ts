import { useSyncExternalStore } from 'react';
import type { Locale } from './locale';
import { getLocale, subscribeLocale } from './locale';

/** The current locale; components re-render when it changes. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, getLocale);
}
