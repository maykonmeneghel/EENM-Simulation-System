import type { MusclePreset } from '../domain/simulation';
import { MUSCLES } from '../domain/simulation';
import type { ApiClient } from '../infrastructure/apiClient';
import { withRetry } from './retry';

export interface MuscleCatalog {
  muscles: MusclePreset[];
  /** Set when the API call failed and the static fallback is being used. */
  error: string | null;
}

/** Loads presets from GET /api/v1/muscles; falls back to the contract enum (no pool sizes). */
export async function loadMuscleCatalog(api: ApiClient, signal?: AbortSignal): Promise<MuscleCatalog> {
  try {
    const muscles = signal ? await withRetry((sig) => api.getMuscles(sig), signal) : await api.getMuscles(signal);
    return { muscles, error: null };
  } catch (err) {
    if (signal?.aborted) throw err;
    return {
      muscles: MUSCLES.map((id) => ({ id, label: id, poolSize: { S: 200, FR: 200, FF: 200 } })),
      error: `Não foi possível carregar os músculos (${err instanceof Error ? err.message : String(err)}). Usando lista padrão.`,
    };
  }
}
