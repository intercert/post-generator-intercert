'use client';

import { apiJson, jsonRequest } from './api-client';
import { createRemoteStore, useRemote } from './remote-store';
import { EMPTY_SAMPLE_COUNTS, type SampleCounts, type SampleInput } from './samples';

// Quantas amostras de referência (posts de exemplo e páginas do manual) estão guardadas no banco.

export const samplesStore = createRemoteStore<SampleCounts>(EMPTY_SAMPLE_COUNTS, async () => {
  const { amostras } = await apiJson<{ amostras: SampleCounts }>('/api/brand/samples', { cache: 'no-store' });
  return amostras;
});

export function useSampleCounts(): SampleCounts {
  return useRemote(samplesStore).data;
}

/** Guarda as amostras no banco. Devolve a mensagem de erro, ou null se deu certo. */
export async function saveSamples(samples: SampleInput[]): Promise<string | null> {
  if (samples.length === 0) return null;
  try {
    const { amostras } = await apiJson<{ amostras: SampleCounts }>('/api/brand/samples', jsonRequest('PUT', { amostras: samples }));
    samplesStore.set(() => amostras);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Não foi possível guardar as referências.';
  }
}

export function clearSampleCounts() {
  samplesStore.set(() => EMPTY_SAMPLE_COUNTS);
}
