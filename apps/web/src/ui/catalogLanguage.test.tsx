import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadMuscleCatalog } from '../application/muscleCatalog';
import type { Locale } from '../i18n/locale';
import { setLocale } from '../i18n/locale';
import type { ApiClient } from '../infrastructure/apiClient';
import { useConditionCatalog } from './useConditionCatalog';
import { useMuscleCatalog } from './useMuscleCatalog';

function fakeApi() {
  const asked: { what: string; locale: Locale | undefined }[] = [];
  const api = {
    async getMuscles(_signal?: AbortSignal, locale?: Locale) {
      asked.push({ what: 'muscles', locale });
      return [{ id: 'SOLEUS', label: locale === 'en' ? 'Soleus (en)' : 'Soleus', poolSize: { S: 800, FR: 50, FF: 50 } }];
    },
    async getConditions(_signal?: AbortSignal, locale?: Locale) {
      asked.push({ what: 'conditions', locale });
      return [{ id: 'SCI_CHRONIC', label: locale === 'en' ? 'Chronic spinal cord injury' : 'Lesão medular crônica', adjustments: [] }];
    },
    streamSimulation: vi.fn(),
  } as unknown as ApiClient;
  return { api, asked };
}

afterEach(() => setLocale('pt-BR'));

describe('catalogs in the chosen language', () => {
  it('the hooks ask in the current language and ask again when it changes', async () => {
    const { api, asked } = fakeApi();
    const muscles = renderHook(() => useMuscleCatalog(api));
    const conditions = renderHook(() => useConditionCatalog(api));
    await waitFor(() => expect(conditions.result.current.conditions[0]?.label).toBe('Lesão medular crônica'));
    await waitFor(() => expect(muscles.result.current.muscles[0]?.label).toBe('Soleus'));
    act(() => setLocale('en'));
    await waitFor(() => expect(conditions.result.current.conditions[0]?.label).toBe('Chronic spinal cord injury'));
    await waitFor(() => expect(muscles.result.current.muscles[0]?.label).toBe('Soleus (en)'));
    expect(asked.filter((a) => a.locale === 'en').map((a) => a.what).sort()).toEqual(['conditions', 'muscles']);
    expect(asked.every((a) => a.locale === 'pt-BR' || a.locale === 'en')).toBe(true);
  });

  it('a failed catalog says so in the current language', async () => {
    const failing = { getMuscles: async () => Promise.reject(new Error('HTTP 502')) } as unknown as ApiClient;
    setLocale('en');
    expect((await loadMuscleCatalog(failing)).error).toBe('Could not load the muscles (HTTP 502). Using the default list.');
    setLocale('pt-BR');
    expect((await loadMuscleCatalog(failing)).error).toBe(
      'Não foi possível carregar os músculos (HTTP 502). Usando lista padrão.',
    );
  });
});
