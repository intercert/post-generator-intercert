'use client';

import { apiJson, jsonRequest } from './api-client';
import { DEFAULT_BRAND, normalizeBrand, type Brand } from './brand';
import { createRemoteStore, useRemote, type RemoteStatus } from './remote-store';

// A identidade visual mora no banco (rota /api/brand). Este módulo guarda uma cópia na tela.

export const brandStore = createRemoteStore<Brand | null>(null, async () => {
  const { brand } = await apiJson<{ brand: unknown }>('/api/brand', { cache: 'no-store' });
  return brand ? normalizeBrand(brand) : null;
});

/** Identidade salva, ou a padrão enquanto carrega ou se ainda não existe. */
export function useBrand(): Brand {
  return useRemote(brandStore).data ?? DEFAULT_BRAND;
}

/** true quando já existe uma identidade salva no banco. */
export function useBrandConfigured(): boolean {
  return useRemote(brandStore).data !== null;
}

/** Estado da carga: use "ready" para não mostrar telas vazias antes de o banco responder. */
export function useBrandStatus(): { status: RemoteStatus; error: string | null } {
  const { status, error } = useRemote(brandStore);
  return { status, error };
}

/** Salva a identidade no banco. Devolve a mensagem de erro, ou null se deu certo. */
export async function saveBrand(brand: Brand): Promise<string | null> {
  try {
    const { brand: saved } = await apiJson<{ brand: unknown }>('/api/brand', jsonRequest('PUT', { brand }));
    brandStore.set(() => normalizeBrand(saved));
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Não foi possível salvar.';
  }
}

export async function resetBrand(): Promise<string | null> {
  try {
    await apiJson('/api/brand', jsonRequest('DELETE'));
    brandStore.set(() => null);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Não foi possível restaurar.';
  }
}
