// Calendário de posts: cada dia guarda o que a equipe planejou (datas comemorativas + instrução do post).
// Quando o dia chega, o gerador abre já com tudo preenchido.

export const ENTRY_STATUSES = ['pendente', 'gerado', 'postado'] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const STATUS_LABELS: Record<EntryStatus, string> = {
  pendente: 'A fazer',
  gerado: 'Gerado',
  postado: 'Postado'
};

export interface CalendarEntry {
  /** YYYY-MM-DD, no fuso local. */
  date: string;
  /** Datas comemorativas do dia (ex.: "Dia do professor"). */
  ocasioes: string[];
  /** O que a equipe quer do post (ex.: "postar para engajamento"). */
  objetivo: string;
  /** Contexto extra para a IA (ex.: o que é o produto da campanha). */
  detalhes: string;
  status: EntryStatus;
}

export const ENTRY_LIMITS = { ocasiao: 120, ocasioes: 8, objetivo: 200, detalhes: 600 } as const;

export const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro'
] as const;

export const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/** Hoje no fuso local, em YYYY-MM-DD. */
export function todayISO(now = new Date()): string {
  return toISO(now.getFullYear(), now.getMonth(), now.getDate());
}

export function parseISO(value: unknown): { year: number; month: number; day: number } | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const d = new Date(year, month, day);
  // Rejeita datas que o JS "corrigiria" (30 de fevereiro vira março)
  return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day ? { year, month, day } : null;
}

export function isValidDate(value: unknown): value is string {
  return parseISO(value) !== null;
}

/** "15 de outubro" (com o ano quando pedido). */
export function formatDay(date: string, withYear = false): string {
  const p = parseISO(date);
  if (!p) return date;
  return `${p.day} de ${MONTH_NAMES[p.month]}${withYear ? ` de ${p.year}` : ''}`;
}

export function weekdayOf(date: string): string {
  const p = parseISO(date);
  return p ? WEEKDAY_SHORT[new Date(p.year, p.month, p.day).getDay()] : '';
}

/** Tema que o gerador recebe: as datas do dia, separadas por " · ". */
export function entryTopic(entry: CalendarEntry): string {
  return entry.ocasioes.join(' · ');
}

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const cleanLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Valida uma entrada vinda do armazenamento ou de um formulário; null se a data for inválida. */
export function normalizeEntry(input: unknown): CalendarEntry | null {
  if (typeof input !== 'object' || input === null) return null;
  const r = input as Record<string, unknown>;
  if (!isValidDate(r.date)) return null;

  const ocasioes = (Array.isArray(r.ocasioes) ? r.ocasioes : [])
    .filter((o): o is string => typeof o === 'string')
    .map((o) => cleanLine(o).slice(0, ENTRY_LIMITS.ocasiao))
    .filter(Boolean)
    .slice(0, ENTRY_LIMITS.ocasioes);

  const status = (ENTRY_STATUSES as readonly string[]).includes(r.status as string)
    ? (r.status as EntryStatus)
    : 'pendente';

  return {
    date: r.date,
    ocasioes,
    objetivo: typeof r.objetivo === 'string' ? cleanLine(r.objetivo).slice(0, ENTRY_LIMITS.objetivo) : '',
    detalhes: typeof r.detalhes === 'string' ? r.detalhes.trim().slice(0, ENTRY_LIMITS.detalhes) : '',
    status
  };
}

/** Uma entrada por data (a última vence), em ordem cronológica. */
export function normalizeEntries(input: unknown): CalendarEntry[] {
  if (!Array.isArray(input)) return [];
  const byDate = new Map<string, CalendarEntry>();
  for (const item of input) {
    const entry = normalizeEntry(item);
    if (entry) byDate.set(entry.date, entry);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- Leitura do texto colado ----------

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

const MONTH_LOOKUP = new Map(MONTH_NAMES.map((name, i) => [stripAccents(name), i]));

// "15 de outubro -> postar para engajamento"  |  "15 de outubro"  |  "15/10 - texto"  |  "16 de outubro. Dia do X"
const SEPARATOR = '(->|→|=>|[-–—:.])';
const DATE_LINE = new RegExp(`^(\\d{1,2})\\s*(?:de\\s+)?([A-Za-zÀ-ÿ]+)\\s*(?:${SEPARATOR}\\s*(.*))?$`);
const NUMERIC_DATE_LINE = new RegExp(`^(\\d{1,2})/(\\d{1,2})\\s*(?:${SEPARATOR}\\s*(.*))?$`);

// Depois de uma seta, o texto é sempre o objetivo. Depois de hífen, dois-pontos ou ponto, é ambíguo:
// se começa como uma data comemorativa ("Dia do...", "Aniversário de..."), entra como data comemorativa.
const ARROWS = new Set(['->', '→', '=>']);
const OCCASION_START = /^(dia|aniversário|aniversario|semana|mês|mes|feriado)\b/i;

function readsAsOccasion(separator: string, rest: string): boolean {
  return !ARROWS.has(separator) && OCCASION_START.test(rest.trim());
}

export interface ParsedCalendar {
  entries: CalendarEntry[];
  /** Avisos legíveis: linhas ignoradas, datas inválidas ou repetidas. */
  problems: string[];
}

/**
 * Lê o formato "dia -> instrução" seguido das datas comemorativas, uma por linha:
 *
 *   15 de outubro -> postar para engajamento
 *   Dia do professor
 *
 * A data comemorativa também pode vir na própria linha do dia, depois de ponto ou hífen:
 *
 *   16 de outubro. Dia da ciência e tecnologia
 *   24 de outubro - Aniversário de Manaus
 *   Aniversário de Goiânia
 *
 * Linhas em branco separam os dias, mas uma nova linha de data também abre um novo dia.
 */
export function parseCalendarText(text: string, year: number): ParsedCalendar {
  const entries = new Map<string, CalendarEntry>();
  const problems: string[] = [];
  let current: CalendarEntry | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\t/g, ' ').trim();
    if (!line) {
      current = null;
      continue;
    }

    let day: number | null = null;
    let month: number | null = null;
    let separator = '';
    let rest = '';

    const written = DATE_LINE.exec(line);
    const numeric = NUMERIC_DATE_LINE.exec(line);
    if (written && MONTH_LOOKUP.has(stripAccents(written[2].toLowerCase()))) {
      day = Number(written[1]);
      month = MONTH_LOOKUP.get(stripAccents(written[2].toLowerCase())) ?? null;
      separator = written[3] ?? '';
      rest = written[4] ?? '';
    } else if (numeric) {
      day = Number(numeric[1]);
      month = Number(numeric[2]) - 1;
      separator = numeric[3] ?? '';
      rest = numeric[4] ?? '';
    }

    if (day !== null && month !== null) {
      const date = toISO(year, month, day);
      if (!isValidDate(date)) {
        problems.push(`Data inválida ignorada: "${line}".`);
        current = null;
        continue;
      }
      if (entries.has(date)) problems.push(`${formatDay(date)} aparece mais de uma vez; vale a última.`);
      // "16 de outubro. Dia X": o que vem na linha da data é a data comemorativa, não o objetivo
      const asOccasion = readsAsOccasion(separator, rest);
      current = {
        date,
        ocasioes: asOccasion ? [capitalize(cleanLine(rest)).slice(0, ENTRY_LIMITS.ocasiao)] : [],
        objetivo: asOccasion ? '' : capitalize(cleanLine(rest)).slice(0, ENTRY_LIMITS.objetivo),
        detalhes: '',
        status: 'pendente'
      };
      entries.set(date, current);
      continue;
    }

    if (current) {
      const occasion = capitalize(cleanLine(line.replace(/^[-•*·]\s*/, '')));
      if (occasion && current.ocasioes.length < ENTRY_LIMITS.ocasioes) {
        current.ocasioes.push(occasion.slice(0, ENTRY_LIMITS.ocasiao));
      }
    } else {
      problems.push(`Linha ignorada (sem data antes): "${line.slice(0, 60)}".`);
    }
  }

  return { entries: [...entries.values()].sort((a, b) => a.date.localeCompare(b.date)), problems };
}

// ---------- Grade do mês ----------

/** Semanas do mês (domingo a sábado); null onde o dia não pertence ao mês. */
export function monthWeeks(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(first).fill(null),
    ...Array.from({ length: days }, (_, i) => toISO(year, month, i + 1))
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
