'use client';

import { useEffect, useState } from 'react';

export type ProviderKey = 'openai' | 'gemini' | 'claude';

/** Quais IAs têm chave no servidor. Enquanto carrega, assume que todas estão disponíveis. */
export function useProviders(): Record<ProviderKey, boolean> {
  const [available, setAvailable] = useState<Record<ProviderKey, boolean>>({ openai: true, gemini: true, claude: true });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/providers', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data === 'object') setAvailable({ openai: !!data.openai, gemini: !!data.gemini, claude: !!data.claude });
      })
      .catch(() => {
        // mantém o padrão
      });
    return () => controller.abort();
  }, []);

  return available;
}
