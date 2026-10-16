'use client';

import { useSyncExternalStore } from 'react';

// Pequeno armazenamento no cliente para dados que moram no servidor: carrega uma vez quando alguém usa,
// avisa os componentes quando muda e aceita atualização otimista (muda na tela e confirma depois).

export type RemoteStatus = 'loading' | 'ready' | 'error';

export interface RemoteState<T> {
  status: RemoteStatus;
  data: T;
  error: string | null;
}

export interface RemoteStore<T> {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => RemoteState<T>;
  getServerSnapshot: () => RemoteState<T>;
  /** Busca de novo no servidor. */
  refresh: () => Promise<void>;
  /** Troca os dados na tela agora (otimista); chame refresh() se o servidor recusar. */
  set: (update: (current: T) => T) => void;
}

export function createRemoteStore<T>(initial: T, load: () => Promise<T>): RemoteStore<T> {
  let state: RemoteState<T> = { status: 'loading', data: initial, error: null };
  let started = false;
  const serverState: RemoteState<T> = { status: 'loading', data: initial, error: null };
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((l) => l());
  const setState = (next: RemoteState<T>) => {
    state = next;
    emit();
  };

  async function refresh() {
    try {
      const data = await load();
      setState({ status: 'ready', data, error: null });
    } catch (err) {
      setState({ ...state, status: 'error', error: err instanceof Error ? err.message : 'Erro desconhecido.' });
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (!started) {
        started = true;
        void refresh();
      }
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    getServerSnapshot: () => serverState,
    refresh,
    set(update) {
      setState({ ...state, data: update(state.data) });
    }
  };
}

export function useRemote<T>(store: RemoteStore<T>): RemoteState<T> {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
