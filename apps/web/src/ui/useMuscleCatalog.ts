import { useEffect, useState } from 'react';
import type { MuscleCatalog } from '../application/muscleCatalog';
import { loadMuscleCatalog } from '../application/muscleCatalog';
import { useLocale } from '../i18n/useLocale';
import type { ApiClient } from '../infrastructure/apiClient';

/** The muscle presets, fetched again (texts in the new language) when the locale changes. */
export function useMuscleCatalog(api: ApiClient): MuscleCatalog & { loading: boolean } {
  const locale = useLocale();
  const [state, setState] = useState<MuscleCatalog & { loading: boolean }>({
    muscles: [],
    error: null,
    loading: true,
  });
  useEffect(() => {
    const abort = new AbortController();
    loadMuscleCatalog(api, abort.signal, locale).then(
      (catalog) => setState({ ...catalog, loading: false }),
      () => undefined, // aborted on unmount
    );
    return () => abort.abort();
  }, [api, locale]);
  return state;
}
