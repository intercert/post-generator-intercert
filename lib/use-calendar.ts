'use client';

import { apiJson, jsonRequest } from './api-client';
import { byDateAndSlot, normalizeEntries, normalizeEntry, type CalendarEntry, type EntryStatus, type Slot } from './calendar';
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

/** Identifica um post do calendário: o dia e a posição (1 ou 2) dentro dele. */
export interface EntryRef {
  date: string;
  slot: Slot;
}

const isRef = (ref: EntryRef | undefined) => (e: CalendarEntry) => ref !== undefined && e.date === ref.date && e.slot === ref.slot;

/** Cria ou substitui um post do dia. Se a data ou a posição mudou, passe a antiga em `previous`. */
export function saveEntry(entry: CalendarEntry, previous?: EntryRef): Promise<string | null> {
  const clean = normalizeEntry(entry);
  if (!clean) return Promise.resolve('Dia inválido. Confira a data.');
  calendarStore.set((list) =>
    [...list.filter((e) => !isRef(clean)(e) && !isRef(previous)(e)), clean].sort(byDateAndSlot)
  );
  return attempt(() =>
    apiJson('/api/calendar', jsonRequest('PUT', { entry: clean, previousDate: previous?.date, previousSlot: previous?.slot }))
  );
}

export function removeEntry(ref: EntryRef): Promise<string | null> {
  calendarStore.set((list) => list.filter((e) => !isRef(ref)(e)));
  return attempt(() => apiJson(`/api/calendar/${ref.date}?slot=${ref.slot}`, jsonRequest('DELETE')));
}

/** Importa vários dias; os que já existem na mesma data são substituídos. */
export async function importEntries(entries: CalendarEntry[]): Promise<string | null> {
  const error = await attempt(() => apiJson('/api/calendar/import', jsonRequest('POST', { entries })));
  if (!error) await calendarStore.refresh();
  return error;
}

export function setEntryStatus(ref: EntryRef, status: EntryStatus): Promise<string | null> {
  calendarStore.set((list) => list.map((e) => (isRef(ref)(e) ? { ...e, status } : e)));
  return attempt(() => apiJson(`/api/calendar/${ref.date}?slot=${ref.slot}`, jsonRequest('PATCH', { status })));
}
