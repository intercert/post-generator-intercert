'use client';

import { useEffect } from 'react';
import { useBrand, useBrandConfigured, useBrandStatus } from '@/lib/use-brand';

declare global {
  interface Window {
    __applyBrandTheme?: (brand: { corPrimaria?: string; corDestaque?: string }) => void;
  }
}

const THEME_CACHE_KEY = 'post-generator:theme:v1';

/**
 * Aplica as cores da identidade (do banco) ao app e guarda uma cópia mínima delas no navegador, para o
 * script do <head> pintar a próxima visita com as cores certas sem esperar a rede.
 */
export default function BrandTheme() {
  const brand = useBrand();
  const configured = useBrandConfigured();
  const { status } = useBrandStatus();

  useEffect(() => {
    if (status !== 'ready') return;
    window.__applyBrandTheme?.(brand);
    try {
      if (configured) {
        localStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ corPrimaria: brand.corPrimaria, corDestaque: brand.corDestaque }));
      } else {
        localStorage.removeItem(THEME_CACHE_KEY);
      }
    } catch {
      // armazenamento bloqueado: só perde o cache de cores
    }
  }, [brand, configured, status]);

  return null;
}
