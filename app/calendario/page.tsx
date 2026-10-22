'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import {
  ENTRY_LIMITS,
  ENTRY_STATUSES,
  MAX_POSTS_PER_DAY,
  MONTH_NAMES,
  STATUS_LABELS,
  WEEKDAY_SHORT,
  entryKey,
  formatDay,
  freeSlot,
  isValidDate,
  monthWeeks,
  needsWork,
  parseCalendarText,
  parseISO,
  toISO,
  weekdayOf,
  type CalendarEntry,
  type EntryStatus,
  type Slot
} from '@/lib/calendar';
import { getFormat } from '@/lib/formats';
import { LAYOUT_LABELS } from '@/lib/brand';
import { deletePost, useSavedPosts, type PostView } from '@/lib/post-store';
import {
  importEntries,
  removeEntry,
  saveEntry,
  setEntryStatus,
  useCalendar,
  useCalendarStatus,
  type EntryRef
} from '@/lib/use-calendar';
import { useToday } from '@/lib/use-today';

/** "quinta-feira, 22 de outubro de 2026", ou um aviso se a data não for válida. */
function dateHint(date: string): string {
  const p = parseISO(date);
  if (!p || !isValidDate(date)) return 'Escolha uma data válida.';
  const weekday = new Date(p.year, p.month, p.day).toLocaleDateString('pt-BR', { weekday: 'long' });
  return `${weekday}, ${formatDay(date, true)}`;
}

const LEGEND_LABELS: Record<EntryStatus, (n: number) => string> = {
  pendente: () => 'a fazer',
  gerado: (n) => (n === 1 ? 'gerado' : 'gerados'),
  agendado: (n) => (n === 1 ? 'agendado' : 'agendados'),
  postado: (n) => (n === 1 ? 'postado' : 'postados')
};

const entryLabel = (e: Pick<CalendarEntry, 'ocasioes' | 'objetivo'>) => e.ocasioes[0] ?? e.objetivo;

/** Marca antes do nome do post na grade: ✓ gerado ou postado, ◷ agendado. */
const statusMark = (status: EntryStatus) => (status === 'pendente' ? '' : status === 'agendado' ? '◷ ' : '✓ ');

const ordinal = (slot: Slot) => `${slot}º`;

interface Editing {
  /** Entrada existente (null = dia novo). */
  entry: CalendarEntry | null;
  date: string;
}

function EntryDialog({
  editing,
  entriesOn,
  hasPost,
  onViewPost,
  onSave,
  onDelete,
  onClose
}: {
  editing: Editing;
  /** Posts que já existem numa data. */
  entriesOn: (date: string) => CalendarEntry[];
  hasPost: boolean;
  onViewPost: (entry: CalendarEntry) => void;
  onSave: (entry: CalendarEntry, previous: EntryRef | undefined, generate: boolean) => void | Promise<void>;
  onDelete: (entry: CalendarEntry) => void;
  onClose: () => void;
}) {
  const { entry } = editing;
  const [date, setDate] = useState(editing.date);
  const [ocasioes, setOcasioes] = useState((entry?.ocasioes ?? []).join('\n'));
  const [objetivo, setObjetivo] = useState(entry?.objetivo ?? '');
  const [detalhes, setDetalhes] = useState(entry?.detalhes ?? '');
  const [status, setStatus] = useState<EntryStatus>(entry?.status ?? 'pendente');
  const [error, setError] = useState<string | null>(null);
  // Ao salvar, o calendário já mostra o novo post; sem isso o aviso do dia piscaria "2 posts" antes de a janela fechar
  const [saving, setSaving] = useState(false);

  // Os outros posts da data escolhida (sem contar este mesmo, quando ele já existe) e a posição que este ocupa
  const others = entriesOn(date).filter((e) => !entry || e.date !== entry.date || e.slot !== entry.slot);
  const slot = entry && date === entry.date ? entry.slot : freeSlot(others.map((e) => e.slot));

  function commit(generate: boolean) {
    if (!isValidDate(date)) {
      setError('Escolha uma data válida.');
      return;
    }
    if (!slot) {
      setError(`${formatDay(date)} já tem ${MAX_POSTS_PER_DAY} posts. Escolha outro dia ou edite um deles.`);
      return;
    }
    const lines = ocasioes
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0 && !objetivo.trim()) {
      setError('Informe ao menos uma data comemorativa ou o objetivo do post.');
      return;
    }
    setSaving(true);
    void Promise.resolve(
      onSave({ date, slot, ocasioes: lines, objetivo, detalhes, status }, entry ? { date: entry.date, slot: entry.slot } : undefined, generate)
    ).finally(() => setSaving(false));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    commit(false);
  }

  return (
    <Modal
      title={entry ? `Post de ${formatDay(entry.date)}` : 'Novo post no calendário'}
      description={
        entry && others.length > 0 && date === entry.date
          ? `Este é o ${ordinal(entry.slot)} dos ${MAX_POSTS_PER_DAY} posts do dia. O que você escrever aqui vai junto na geração.`
          : 'O que você escrever aqui vai junto na geração do post.'
      }
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          {entry && (
            <button
              type="button"
              className="btn btn-quiet btn-danger"
              onClick={() => {
                if (window.confirm(`Remover o post de ${formatDay(entry.date)} do calendário?`)) onDelete(entry);
              }}
            >
              Remover
            </button>
          )}
          <span className="spacer" />
          {entry && hasPost && (
            <button type="button" className="btn btn-quiet" onClick={() => onViewPost(entry)}>
              Ver post gerado
            </button>
          )}
          <button type="submit" className="btn btn-quiet">
            Salvar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => commit(true)}>
            Salvar e gerar post
          </button>
        </>
      }
    >
      <div className="fields">
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}

        <div className="field">
          <label htmlFor="e-date" className="label">
            Data da postagem
          </label>
          <input id="e-date" className="input input-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <p className="hint">{dateHint(date)}</p>
          {others.length > 0 && !saving && (
            <p className="hint day-note" data-full={!slot}>
              {slot
                ? `Este dia já tem um post (${entryLabel(others[0])}). Este será o ${ordinal(slot)} do dia.`
                : `Este dia já tem ${MAX_POSTS_PER_DAY} posts.`}
            </p>
          )}
        </div>

        <fieldset className="fs field">
          <legend className="label">Situação</legend>
          <div className="row status-group">
            {ENTRY_STATUSES.map((s) => (
              <label key={s} className="pick">
                <input type="radio" name="e-status" value={s} checked={status === s} onChange={() => setStatus(s)} />
                <span className="face face-pill status-opt" data-status={s}>
                  <i aria-hidden="true" />
                  {STATUS_LABELS[s]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor="e-ocasioes" className="label">
            Datas comemorativas do dia
          </label>
          <p className="hint field-hint">Uma por linha.</p>
          <textarea
            id="e-ocasioes"
            className="input textarea textarea-short"
            rows={3}
            value={ocasioes}
            placeholder="Ex.: Dia do professor"
            onChange={(e) => setOcasioes(e.target.value)}
          />
        </div>

        <div className="field">
          <div className="caption-head">
            <label htmlFor="e-objetivo" className="label">
              Objetivo do post
            </label>
            <span className="counter">
              {objetivo.length}/{ENTRY_LIMITS.objetivo}
            </span>
          </div>
          <input
            id="e-objetivo"
            className="input"
            type="text"
            maxLength={ENTRY_LIMITS.objetivo}
            value={objetivo}
            placeholder="Ex.: postar para engajamento"
            onChange={(e) => setObjetivo(e.target.value)}
          />
        </div>

        <div className="field">
          <div className="caption-head">
            <label htmlFor="e-detalhes" className="label">
              Detalhes para a IA <span className="optional">(opcional)</span>
            </label>
            <span className="counter">
              {detalhes.length}/{ENTRY_LIMITS.detalhes}
            </span>
          </div>
          <p className="hint field-hint">O que é o produto da campanha, o que destacar e o que não falar.</p>
          <textarea
            id="e-detalhes"
            className="input textarea textarea-short"
            rows={3}
            maxLength={ENTRY_LIMITS.detalhes}
            value={detalhes}
            onChange={(e) => setDetalhes(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}

function ImportDialog({
  defaultYear,
  existingKeys,
  onImport,
  onClose
}: {
  defaultYear: number;
  existingKeys: Set<string>;
  onImport: (entries: CalendarEntry[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [year, setYear] = useState(String(defaultYear));

  const parsed = useMemo(() => {
    const y = Number(year);
    if (!text.trim() || !Number.isInteger(y) || y < 2000 || y > 2100) return null;
    return parseCalendarText(text, y);
  }, [text, year]);

  const replaced = parsed ? parsed.entries.filter((e) => existingKeys.has(entryKey(e.date, e.slot))).length : 0;

  return (
    <Modal
      title="Importar dias de um texto"
      description="Cole a lista do mês e confira o resultado antes de importar. Uma data repetida vira o 2º post do dia."
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!parsed || parsed.entries.length === 0}
            onClick={() => parsed && onImport(parsed.entries)}
          >
            {parsed && parsed.entries.length > 0 ? `Importar ${parsed.entries.length} dias` : 'Importar'}
          </button>
        </>
      }
    >
      <div className="fields">
        <div className="field">
          <label htmlFor="i-text" className="label">
            Texto do calendário
          </label>
          <p className="hint field-hint">
            Cada dia começa com a data, como &ldquo;15 de outubro&rdquo;. Depois de <code className="mono">-&gt;</code> vem o
            objetivo, e as datas comemorativas ficam nas linhas de baixo.
          </p>
          <textarea
            id="i-text"
            className="input textarea mono"
            rows={9}
            value={text}
            placeholder={'15 de outubro -> postar para engajamento\nDia do professor\n\n16 de outubro -> vínculo com nossa empresa\nDia da ciência e tecnologia'}
            onChange={(e) => setText(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="i-year" className="label">
            Ano
          </label>
          <input
            id="i-year"
            className="input input-short"
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
          <p className="hint">O texto não traz o ano, então ele vem daqui.</p>
        </div>

        {parsed && parsed.entries.length > 0 && (
          <div>
            <h3 className="label">O que será importado ({parsed.entries.length})</h3>
            <ul className="preview-list">
              {parsed.entries.map((e) => (
                <li key={entryKey(e.date, e.slot)}>
                  <strong>
                    {formatDay(e.date)}
                    {e.slot > 1 && <small className="slot-tag">{ordinal(e.slot)} post</small>}
                  </strong>
                  <div>
                    <span>{e.objetivo || 'Sem objetivo informado'}</span>
                    <small>{e.ocasioes.join(', ') || 'Sem datas comemorativas'}</small>
                  </div>
                  {existingKeys.has(entryKey(e.date, e.slot)) && <em>Substitui</em>}
                </li>
              ))}
            </ul>
            {replaced > 0 && (
              <p className="hint">
                {replaced} {replaced === 1 ? 'dia já existe e será substituído' : 'dias já existem e serão substituídos'}.
              </p>
            )}
          </div>
        )}

        {parsed && parsed.problems.length > 0 && (
          <div className="callout" role="note">
            <strong>Avisos</strong>
            <ul>
              {parsed.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        {parsed && parsed.entries.length === 0 && (
          <p className="hint">Não encontrei nenhuma data nesse texto. Cada dia precisa começar com algo como &ldquo;15 de outubro&rdquo;.</p>
        )}
      </div>
    </Modal>
  );
}

function ViewPostDialog({
  entry,
  post,
  ofDay,
  onClose
}: {
  entry: CalendarEntry | undefined;
  post: PostView;
  /** Quantos posts o dia tem. */
  ofDay: number;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const format = getFormat(post.formatId);

  async function copy() {
    try {
      await navigator.clipboard.writeText(post.legenda);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Modal
      title={`Post de ${formatDay(post.date)}${ofDay > 1 ? `, ${ordinal(post.slot)} do dia` : ''}`}
      description={`Gerado em ${new Date(post.savedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn btn-quiet btn-danger"
            onClick={() => {
              if (!window.confirm('Apagar o post salvo deste dia? O dia continua no calendário.')) return;
              void deletePost(post.date, post.slot);
              if (entry?.status === 'gerado') setEntryStatus(entry, 'pendente');
              onClose();
            }}
          >
            Apagar post
          </button>
          <span className="spacer" />
          <Link className="btn btn-quiet" href={`/?data=${post.date}&pos=${post.slot}&auto=1`}>
            Gerar de novo
          </Link>
          {entry && needsWork(entry.status) && (
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                setEntryStatus(entry, 'agendado');
                onClose();
              }}
            >
              Marcar como agendado
            </button>
          )}
          {entry && entry.status !== 'postado' && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setEntryStatus(entry, 'postado');
                onClose();
              }}
            >
              Marcar como postado
            </button>
          )}
          {(!entry || entry.status === 'postado') && (
            <button type="button" className="btn btn-quiet" onClick={onClose}>
              Fechar
            </button>
          )}
        </>
      }
    >
      <div className="post-view">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="post-view-img" src={post.imageUrl} alt={`Arte do post: ${post.titulo}`} />
        <div className="post-view-side">
          {post.imageWarning && (
            <p className="callout" role="note">
              <strong>Foto de fundo é um placeholder.</strong> {post.imageWarning}
            </p>
          )}
          <dl className="post-facts">
            {format && (
              <div>
                <dt>Formato</dt>
                <dd>
                  {format.label}, {format.width} × {format.height}
                </dd>
              </div>
            )}
            <div>
              <dt>Layout</dt>
              <dd>{LAYOUT_LABELS[post.layout]}</dd>
            </div>
          </dl>
          <div className="caption-head">
            <span className="label">Legenda</span>
            <button type="button" className={`btn btn-small btn-quiet${copied ? ' btn-ok' : ''}`} onClick={copy}>
              {copied ? 'Copiado' : 'Copiar legenda'}
            </button>
          </div>
          <textarea className="input textarea" rows={10} readOnly value={post.legenda} aria-label="Legenda do post" />
          <div className="actions">
            <a className="btn btn-primary" href={post.imageUrl} download={`post-${post.formatId}-${post.date}${post.slot > 1 ? `-${post.slot}` : ''}.png`}>
              Baixar PNG
            </a>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function EntryCard({
  entry,
  ofDay,
  today,
  post,
  onEdit,
  onView
}: {
  entry: CalendarEntry;
  /** Quantos posts o dia tem. */
  ofDay: number;
  today: string;
  post: PostView | undefined;
  onEdit: (entry: CalendarEntry) => void;
  onView: (key: string) => void;
}) {
  const p = parseISO(entry.date);
  const isToday = entry.date === today;
  const late = entry.date < today && entry.status === 'pendente';

  return (
    <li className="agenda-item" data-today={isToday} data-status={entry.status}>
      <div className="agenda-date" aria-hidden="true">
        <strong>{p?.day}</strong>
        <span>{p ? MONTH_NAMES[p.month].slice(0, 3) : ''}</span>
        <small>{weekdayOf(entry.date)}</small>
      </div>

      {post && (
        <button type="button" className="agenda-thumb" onClick={() => onView(entryKey(entry.date, entry.slot))} aria-label={`Ver o post de ${formatDay(entry.date)}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.imageUrl} alt="" />
        </button>
      )}

      <div className="agenda-body">
        <div className="agenda-top">
          <h3>{entryLabel(entry)}</h3>
          {ofDay > 1 && <span className="badge badge-slot">{ordinal(entry.slot)} post</span>}
          <span className="badge" data-status={entry.status}>
            {statusMark(entry.status)}
            {STATUS_LABELS[entry.status]}
          </span>
          {isToday && <span className="badge badge-today">Hoje</span>}
          {late && <span className="badge badge-late">Atrasado</span>}
        </div>
        {entry.ocasioes.length > 1 && (
          <ul className="agenda-occasions">
            {entry.ocasioes.slice(1).map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        )}
        {entry.objetivo && <p className="agenda-goal">{entry.objetivo}</p>}
        {entry.detalhes && <p className="hint">{entry.detalhes}</p>}

        <div className="agenda-actions">
          {post && (
            <button type="button" className="btn btn-primary btn-small" onClick={() => onView(entryKey(entry.date, entry.slot))}>
              Ver post
            </button>
          )}
          <Link className={`btn btn-small ${post ? 'btn-quiet' : 'btn-primary'}`} href={`/?data=${entry.date}&pos=${entry.slot}&auto=1`}>
            {post ? 'Gerar de novo' : 'Gerar post'}
          </Link>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => onEdit(entry)}>
            Editar
          </button>
          <label className="status-pick">
            <span className="sr-only">
              Situação do post de {formatDay(entry.date)}
              {ofDay > 1 ? `, ${ordinal(entry.slot)} do dia` : ''}
            </span>
            <select
              className="input input-small"
              value={entry.status}
              onChange={(e) => setEntryStatus(entry, e.target.value as EntryStatus)}
            >
              {ENTRY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </li>
  );
}

export default function CalendarPage() {
  const router = useRouter();
  const entries = useCalendar();
  const { status: calendarStatus } = useCalendarStatus();
  const posts = useSavedPosts();
  const today = useToday();

  const [view, setView] = useState<{ year: number; month: number } | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [importing, setImporting] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cada data guarda até 2 posts; byKey acha um deles pela data e posição
  const entriesByDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of entries) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  }, [entries]);
  const byKey = useMemo(() => new Map(entries.map((e) => [entryKey(e.date, e.slot), e])), [entries]);
  const existingKeys = useMemo(() => new Set(byKey.keys()), [byKey]);

  if (!today || calendarStatus === 'loading') {
    return (
      <main className="shell">
        <header className="masthead">
          <h1>Calendário de posts</h1>
          <p className="lead" role="status">
            Carregando o calendário…
          </p>
        </header>
      </main>
    );
  }

  const now = parseISO(today)!;
  const { year, month } = view ?? { year: now.year, month: now.month };
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthEntries = entries.filter((e) => e.date.startsWith(prefix));
  const next = entries.find((e) => e.date >= today && needsWork(e.status));
  const weeks = monthWeeks(year, month);

  function flash(message: string) {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }

  function shift(delta: number) {
    const d = new Date(year, month + delta, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() });
  }

  const entriesOn = (date: string) => entriesByDate.get(date) ?? [];

  /** Primeira data, a partir de `from`, que ainda tem vaga para um post. */
  function nextOpenDate(from: string): string {
    const start = parseISO(from);
    if (!start) return from;
    for (let i = 0; i < 366; i++) {
      const d = new Date(start.year, start.month, start.day + i);
      const date = toISO(d.getFullYear(), d.getMonth(), d.getDate());
      if (entriesOn(date).length < MAX_POSTS_PER_DAY) return date;
    }
    return from;
  }

  async function handleSave(entry: CalendarEntry, previous: EntryRef | undefined, generate: boolean) {
    const error = await saveEntry(entry, previous);
    if (error) {
      setFailure(error);
      return;
    }
    setFailure(null);
    setEditing(null);
    const p = parseISO(entry.date);
    if (p) setView({ year: p.year, month: p.month });
    flash(`Post de ${formatDay(entry.date)} salvo.`);
    if (generate) router.push(`/?data=${entry.date}&pos=${entry.slot}&auto=1`);
  }

  async function handleDelete(entry: CalendarEntry) {
    setEditing(null);
    const error = await removeEntry(entry);
    if (error) setFailure(error);
    else flash(`Post de ${formatDay(entry.date)} removido.`);
  }

  async function handleImport(list: CalendarEntry[]) {
    const error = await importEntries(list);
    setImporting(false);
    if (error) {
      setFailure(error);
      return;
    }
    setFailure(null);
    const first = parseISO(list[0]?.date);
    if (first) setView({ year: first.year, month: first.month });
    flash(`${list.length} ${list.length === 1 ? 'post importado' : 'posts importados'}.`);
  }

  return (
    <main className="shell">
      <header className="masthead">
        <h1>Calendário de posts</h1>
        <p className="lead">
          Planeje os dias com antecedência: datas comemorativas e o objetivo de cada post. No dia, é só abrir e gerar,
          já com tudo preenchido e no padrão da marca.
        </p>
      </header>

      {notice && (
        <p className="notice-ok" role="status">
          {notice}
        </p>
      )}
      {failure && (
        <p role="alert" className="error">
          {failure}
        </p>
      )}

      {next && (
        <section className="next-card" aria-labelledby="next-title">
          <div className="next-date" aria-hidden="true">
            <strong>{Number(next.date.slice(8))}</strong>
            <span>{MONTH_NAMES[Number(next.date.slice(5, 7)) - 1].slice(0, 3)}</span>
          </div>
          <div className="next-body">
            <h2 id="next-title" className="next-label">
              {next.date === today ? 'Para postar hoje' : 'Próximo post'}
              <span className="sr-only">, {formatDay(next.date)}</span>
            </h2>
            <p className="next-title">
              {entryLabel(next)}
              {next.ocasioes.length > 1 && ` +${next.ocasioes.length - 1}`}
            </p>
            {next.objetivo && next.ocasioes.length > 0 && <p className="next-goal">{next.objetivo}</p>}
          </div>
          <Link className="btn btn-on-brand" href={`/?data=${next.date}&pos=${next.slot}&auto=1`}>
            Gerar post
          </Link>
        </section>
      )}

      <div className="cal-bar">
        <div className="cal-nav">
          <h2 className="cal-title">
            {MONTH_NAMES[month].charAt(0).toUpperCase() + MONTH_NAMES[month].slice(1)} de {year}
          </h2>
          <div className="cal-stepper">
            <button type="button" onClick={() => shift(-1)} aria-label="Mês anterior">
              ‹
            </button>
            <button type="button" onClick={() => shift(1)} aria-label="Próximo mês">
              ›
            </button>
          </div>
          {(year !== now.year || month !== now.month) && (
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setView(null)}>
              Hoje
            </button>
          )}
        </div>
        <div className="cal-tools">
          <button type="button" className="btn btn-quiet btn-small" onClick={() => setImporting(true)}>
            Importar de um texto
          </button>
          <button
            type="button"
            className="btn btn-primary btn-small"
            onClick={() => setEditing({ entry: null, date: nextOpenDate(today) })}
          >
            Adicionar post
          </button>
        </div>
      </div>

      <p className="cal-legend">
        {ENTRY_STATUSES.map((st) => {
          const count = monthEntries.filter((e) => e.status === st).length;
          return (
            <span key={st} data-status={st}>
              <i aria-hidden="true" />
              {count} {LEGEND_LABELS[st](count)}
            </span>
          );
        })}
      </p>

      <div className="cal-grid" role="group" aria-label={`Calendário de ${MONTH_NAMES[month]} de ${year}`}>
        {WEEKDAY_SHORT.map((d) => (
          <div key={d} className="cal-weekday" aria-hidden="true">
            {d}
          </div>
        ))}
        {weeks.flat().map((date, i) => {
          if (!date) return <div key={`blank-${i}`} className="cal-day cal-blank" aria-hidden="true" />;
          const dayEntries = entriesOn(date);
          const day = Number(date.slice(8));
          return (
            <div
              key={date}
              className="cal-day"
              data-today={date === today}
              data-past={date < today}
              data-weekend={i % 7 === 0 || i % 7 === 6}
              data-count={dayEntries.length}
            >
              <span className="cal-num">{day}</span>
              {dayEntries.map((entry) => {
                const post = posts[entryKey(entry.date, entry.slot)];
                return (
                  <button
                    key={entry.slot}
                    type="button"
                    className="cal-chip"
                    data-status={entry.status}
                    aria-label={`${formatDay(date)}${dayEntries.length > 1 ? `, ${ordinal(entry.slot)} post` : ''}: ${entryLabel(entry)}, ${STATUS_LABELS[entry.status]}`}
                    onClick={() => setEditing({ entry, date })}
                  >
                    {post ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="cal-thumb" src={post.imageUrl} alt="" />
                    ) : (
                      <i aria-hidden="true" />
                    )}
                    <span>
                      {statusMark(entry.status)}
                      {entryLabel(entry)}
                    </span>
                    {entry.ocasioes.length > 1 && <b>+{entry.ocasioes.length - 1}</b>}
                  </button>
                );
              })}
              {dayEntries.length < MAX_POSTS_PER_DAY && (
                <button
                  type="button"
                  className="cal-add"
                  data-empty={dayEntries.length === 0}
                  aria-label={
                    dayEntries.length === 0
                      ? `Adicionar post em ${formatDay(date)}`
                      : `Adicionar o ${ordinal(2)} post de ${formatDay(date)}`
                  }
                  onClick={() => setEditing({ entry: null, date })}
                >
                  <span aria-hidden="true">{dayEntries.length === 0 ? '+' : '+ 2º post'}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      <section aria-labelledby="agenda-title" className="agenda">
        <h2 id="agenda-title" className="q">
          Posts de {MONTH_NAMES[month]}
        </h2>
        {monthEntries.length === 0 ? (
          <div className="agenda-empty">
            <p>Nenhum post planejado em {MONTH_NAMES[month]}.</p>
            <div className="actions">
              <button type="button" className="btn btn-primary btn-small" onClick={() => setEditing({ entry: null, date: nextOpenDate(today) })}>
                Adicionar post
              </button>
              <button type="button" className="btn btn-quiet btn-small" onClick={() => setImporting(true)}>
                Importar de um texto
              </button>
            </div>
          </div>
        ) : (
          <ul className="agenda-list">
            {monthEntries.map((entry) => (
              <EntryCard
                key={entryKey(entry.date, entry.slot)}
                entry={entry}
                ofDay={entriesOn(entry.date).length}
                today={today}
                post={posts[entryKey(entry.date, entry.slot)]}
                onEdit={(e) => setEditing({ entry: e, date: e.date })}
                onView={setViewing}
              />
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <EntryDialog
          key={editing.entry ? entryKey(editing.entry.date, editing.entry.slot) : `new-${editing.date}`}
          editing={editing}
          entriesOn={entriesOn}
          hasPost={!!(editing.entry && posts[entryKey(editing.entry.date, editing.entry.slot)])}
          onViewPost={(entry) => {
            setEditing(null);
            setViewing(entryKey(entry.date, entry.slot));
          }}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditing(null)}
        />
      )}
      {viewing && posts[viewing] && (
        <ViewPostDialog
          key={viewing}
          entry={byKey.get(viewing)}
          post={posts[viewing]}
          ofDay={entriesOn(posts[viewing].date).length}
          onClose={() => setViewing(null)}
        />
      )}
      {importing && (
        <ImportDialog
          defaultYear={year}
          existingKeys={existingKeys}
          onImport={handleImport}
          onClose={() => setImporting(false)}
        />
      )}
    </main>
  );
}
