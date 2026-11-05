import { useEffect, useState } from 'react';
import type { MuscleCatalog } from '../application/muscleCatalog';
import { loadMuscleCatalog } from '../application/muscleCatalog';
import type { ApiClient } from '../infrastructure/apiClient';

export function useMuscleCatalog(api: ApiClient): MuscleCatalog & { loading: boolean } {
  const [state, setState] = useState<MuscleCatalog & { loading: boolean }>({
    muscles: [],
    error: null,
    loading: true,
  });
  useEffect(() => {
    const abort = new AbortController();
    loadMuscleCatalog(api, abort.signal).then(
      (catalog) => setState({ ...catalog, loading: false }),
      () => undefined, // aborted on unmount
    );
    return () => abort.abort();
  }, [api]);
  return state;
}
