/**
 * The app's language: Brazilian Portuguese (the original) or English, chosen in the toolbar and kept in localStorage.
 *
 * Texts live next to the code that uses them, as `{ 'pt-BR': …, en: … }` pairs read with `tr()`; TypeScript makes
 * both languages required. The current locale is module state (not threaded through every pure function that builds
 * a text, like the TeX of the equations): the app window remounts when it changes, so every text is rebuilt.
 */
export type Locale = 'pt-BR' | 'en';

export const LOCALES: readonly Locale[] = ['pt-BR', 'en'];

/** A text (or any value) in each language. */
export type Localized<T = string> = Readonly<Record<Locale, T>>;

const STORAGE_KEY = 'eenm.locale';
const DEFAULT_LOCALE: Locale = 'pt-BR';

function stored(): Locale {
  try {
    const v = globalThis.localStorage?.getItem(STORAGE_KEY);
    return v === 'en' || v === 'pt-BR' ? v : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

let current: Locale = stored();
const listeners = new Set<(l: Locale) => void>();

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  if (locale === current) return;
  current = locale;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, locale);
  } catch {
    // private mode: the choice lasts until the page is reloaded
  }
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  for (const l of listeners) l(locale);
}

export function subscribeLocale(listener: (l: Locale) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The value for the current locale. */
export function tr<T>(texts: Localized<T>): T {
  return texts[current];
}

/** The decimal separator of the current locale ("," or "."). */
export function decimalSeparator(): string {
  return current === 'en' ? '.' : ',';
}

/** `Number.prototype.toLocaleString` in the current locale. */
export function fmtNumber(x: number, options?: Intl.NumberFormatOptions): string {
  return x.toLocaleString(current, options);
}

/** The app's name in the current locale. */
export const APP_NAME: Localized = { 'pt-BR': 'Simulador EENM', en: 'EENM Simulator' };
