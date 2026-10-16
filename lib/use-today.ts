'use client';

import { useSyncExternalStore } from 'react';
import { todayISO } from './calendar';

const noopSubscribe = () => () => {};

/** Hoje no fuso do navegador (YYYY-MM-DD); vazio no servidor para não divergir na hidratação. */
export function useToday(): string {
  return useSyncExternalStore(noopSubscribe, () => todayISO(), () => '');
}
