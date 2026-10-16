'use client';

import { useSyncExternalStore } from 'react';

function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
}

/** Lê um parâmetro da URL (?nome=valor) sem exigir Suspense; vazio no servidor. */
export function useQueryParam(name: string): string {
  return useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get(name) ?? '',
    () => ''
  );
}
