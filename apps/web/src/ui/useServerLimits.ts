import { useEffect, useState } from 'react';
import type { ServerLimits } from '../domain/limits';
import { CONTRACT_LIMITS } from '../domain/limits';
import type { ApiClient } from '../infrastructure/apiClient';

/** The server's limits, fetched once; the contract ranges until they arrive or if the server does not have them. */
export function useServerLimits(api: ApiClient): ServerLimits {
  const [limits, setLimits] = useState<ServerLimits>(CONTRACT_LIMITS);
  useEffect(() => {
    if (!api.getLimits) return;
    const abort = new AbortController();
    api.getLimits(abort.signal).then(setLimits, () => undefined); // aborted, or an older API: keep the contract
    return () => abort.abort();
  }, [api]);
  return limits;
}
