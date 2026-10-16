'use client';

import { apiJson, jsonRequest } from './api-client';
import { normalizeEntries, normalizeEntry, type CalendarEntry, type EntryStatus } from './calendar';
import { createRemoteStore, useRemote, type RemoteStatus } from './remote-store';

// O calendário mora no banco (rotas /api/calendar). As mudanças aparecem na tela na hora e são confirmadas
// no servidor; se o servidor recusar, a lista é recarregada e a função devolve a mensagem de erro.

const EMPTY: CalendarEntry[] = [];

export const calendarStore = createRemoteStore<CalendarEntry[]>(EMPTY, async () => {
  const { entries } = await apiJson<{ entries: unknown }>('/api/calendar', { cache: 'no-store' });
  return normalizeEntries(entries);
});

export function useCalendar(): CalendarEntry[] {
  return useRemote(calendarStore).data;
}

export function useCalendarStatus(): { status: RemoteStatus; error: string | null } {
  const { status, error } = useRemote(calendarStore);
  return { status, error };
}

async function attempt(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (err) {
    await calendarStore.refresh();
    return err instanceof Error ? err.message : 'Não foi possível salvar.';
  }
}

const byDate = (a: CalendarEntry, b: CalendarEntry) => a.date.localeCompare(b.date);

/** Cria ou substitui o dia. Se a data mudou, passe a data antiga em `previousDate`. */
export function saveEntry(entry: CalendarEntry, previousDate?: string): Promise<string | null> {
  const clean = normalizeEntry(entry);
  if (!clean) return Promise.resolve('Dia inválido. Confira a data.');
  calendarStore.set((list) => [...list.filter((e) => e.date !== clean.date && e.date !== previousDate), clean].sort(byDate));
  return attempt(() => apiJson('/api/calendar', jsonRequest('PUT', { entry: clean, previousDate })));
}

export function removeEntry(date: string): Promise<string | null> {
  calendarStore.set((list) => list.filter((e) => e.date !== date));
  return attempt(() => apiJson(`/api/calendar/${date}`, jsonRequest('DELETE')));
}

/** Importa vários dias; os que já existem na mesma data são substituídos. */
export async function importEntries(entries: CalendarEntry[]): Promise<string | null> {
  const error = await attempt(() => apiJson('/api/calendar/import', jsonRequest('POST', { entries })));
  if (!error) await calendarStore.refresh();
  return error;
}

export function setEntryStatus(date: string, status: EntryStatus): Promise<string | null> {
  calendarStore.set((list) => list.map((e) => (e.date === date ? { ...e, status } : e)));
  return attempt(() => apiJson(`/api/calendar/${date}`, jsonRequest('PATCH', { status })));
}
