import type { MusclePreset } from '../domain/simulation';
import { MUSCLES } from '../domain/simulation';
import type { Locale } from '../i18n/locale';
import { tr } from '../i18n/locale';
import type { ApiClient } from '../infrastructure/apiClient';
import { withRetry } from './retry';

export interface MuscleCatalog {
  muscles: MusclePreset[];
  /** Set when the API call failed and the static fallback is being used. */
  error: string | null;
}

/** Loads presets from GET /api/v1/muscles (texts in `locale`); falls back to the contract enum (no pool sizes). */
export async function loadMuscleCatalog(api: ApiClient, signal?: AbortSignal, locale?: Locale): Promise<MuscleCatalog> {
  try {
    const muscles = signal
      ? await withRetry((sig) => api.getMuscles(sig, locale), signal)
      : await api.getMuscles(signal, locale);
    return { muscles, error: null };
  } catch (err) {
    if (signal?.aborted) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    return {
      muscles: MUSCLES.map((id) => ({ id, label: id, poolSize: { S: 200, FR: 200, FF: 200 } })),
      error: tr({
        'pt-BR': `Não foi possível carregar os músculos (${reason}). Usando lista padrão.`,
        en: `Could not load the muscles (${reason}). Using the default list.`,
      }),
    };
  }
}
