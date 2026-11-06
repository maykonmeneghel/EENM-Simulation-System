import { useEffect, useState } from 'react';
import type { ConditionInfo } from '../domain/simulation';
import { tr } from '../i18n/locale';
import { useLocale } from '../i18n/useLocale';
import type { ApiClient } from '../infrastructure/apiClient';
import { withRetry } from '../application/retry';

export interface ConditionCatalog {
  conditions: ConditionInfo[];
  error: string | null;
}

/**
 * GET /api/v1/conditions in the current language (fetched again when it changes); without it only "Normal" can be
 * simulated (no adjustments are invented client-side).
 */
export function useConditionCatalog(api: ApiClient): ConditionCatalog {
  const locale = useLocale();
  const [state, setState] = useState<ConditionCatalog>({ conditions: [], error: null });
  useEffect(() => {
    const abort = new AbortController();
    withRetry((signal) => api.getConditions(signal, locale), abort.signal).then(
      (conditions) => setState({ conditions, error: null }),
      (err: unknown) => {
        if (abort.signal.aborted) return;
        const reason = err instanceof Error ? err.message : String(err);
        setState({
          conditions: [],
          error: tr({
            'pt-BR': `Não foi possível carregar as condições (${reason}).`,
            en: `Could not load the conditions (${reason}).`,
          }),
        });
      },
    );
    return () => abort.abort();
  }, [api, locale]);
  return state;
}
