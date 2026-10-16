// Conversões entre as linhas do banco e os tipos do app (servidor).
import { normalizeBrand, type Brand } from '@/lib/brand';
import { normalizeEntry, type CalendarEntry } from '@/lib/calendar';

export function brandFromRow(row: { profile: string; logo: string; logoClara: string }): Brand {
  let profile: unknown = {};
  try {
    profile = JSON.parse(row.profile);
  } catch {
    // perfil corrompido: volta ao padrão, mantendo as logos
  }
  return normalizeBrand({ ...(typeof profile === 'object' && profile !== null ? profile : {}), logo: row.logo, logoClara: row.logoClara });
}

/** O perfil vai em JSON de texto; as logos (grandes) ficam em colunas próprias. */
export function brandToRow(input: unknown) {
  const { logo, logoClara, ...profile } = normalizeBrand(input);
  return { profile: JSON.stringify(profile), logo, logoClara };
}

export function entryFromRow(row: {
  date: string;
  ocasioes: string;
  objetivo: string;
  detalhes: string;
  status: string;
}): CalendarEntry | null {
  let ocasioes: unknown = [];
  try {
    ocasioes = JSON.parse(row.ocasioes);
  } catch {
    // lista corrompida: fica vazia
  }
  return normalizeEntry({ date: row.date, ocasioes, objetivo: row.objetivo, detalhes: row.detalhes, status: row.status });
}

export function entryToData(entry: CalendarEntry) {
  return {
    date: entry.date,
    ocasioes: JSON.stringify(entry.ocasioes),
    objetivo: entry.objetivo,
    detalhes: entry.detalhes,
    status: entry.status
  };
}
