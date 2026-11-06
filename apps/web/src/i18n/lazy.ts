import type { Localized } from './locale';
import { tr } from './locale';

/**
 * A record whose values are derived from `source` on each access (getters), so module-level tables keep their shape
 * and still follow a language change.
 */
export function lazyRecord<K extends string, L, T>(source: Readonly<Record<K, L>>, resolve: (value: L) => T): Readonly<Record<K, T>> {
  const out = {} as Record<K, T>;
  for (const key of Object.keys(source) as K[]) {
    Object.defineProperty(out, key, { enumerable: true, get: () => resolve(source[key]) });
  }
  return out;
}

/** A record of texts read in the current locale on access. */
export function localizedRecord<K extends string>(texts: Readonly<Record<K, Localized>>): Readonly<Record<K, string>> {
  return lazyRecord(texts, tr);
}

/** `base` plus string properties read in the current locale on each access (fields, steps, options). */
export function withTexts<B extends object, K extends string>(base: B, texts: Readonly<Record<K, Localized>>): B & Readonly<Record<K, string>> {
  const out = { ...base } as B & Record<K, string>;
  for (const k of Object.keys(texts) as K[]) {
    Object.defineProperty(out, k, { get: () => tr(texts[k]), enumerable: true, configurable: true });
  }
  return out;
}
