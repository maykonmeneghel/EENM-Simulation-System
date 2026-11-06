import { useEffect, useState } from 'react';
import type { ConditionInfo } from '../domain/simulation';
import type { ApiClient } from '../infrastructure/apiClient';

export interface ConditionCatalog {
  conditions: ConditionInfo[];
  error: string | null;
}

/** GET /api/v1/conditions; without it only "Normal" can be simulated (no adjustments are invented client-side). */
export function useConditionCatalog(api: ApiClient): ConditionCatalog {
  const [state, setState] = useState<ConditionCatalog>({ conditions: [], error: null });
  useEffect(() => {
    const abort = new AbortController();
    api.getConditions(abort.signal).then(
      (conditions) => setState({ conditions, error: null }),
      (err: unknown) => {
        if (abort.signal.aborted) return;
        setState({
          conditions: [],
          error: `Não foi possível carregar as condições (${err instanceof Error ? err.message : String(err)}).`,
        });
      },
    );
    return () => abort.abort();
  }, [api]);
  return state;
}
