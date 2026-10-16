'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import {
  ENTRY_LIMITS,
  ENTRY_STATUSES,
  MONTH_NAMES,
  STATUS_LABELS,
  WEEKDAY_SHORT,
  formatDay,
  isValidDate,
  monthWeeks,
  parseCalendarText,
  parseISO,
  weekdayOf,
  type CalendarEntry,
  type EntryStatus
} from '@/lib/calendar';
import { getFormat } from '@/lib/formats';
import { LAYOUT_LABELS } from '@/lib/brand';
import { deletePost, useSavedPosts, type PostView } from '@/lib/post-store';
import { importEntries, removeEntry, saveEntry, setEntryStatus, useCalendar, useCalendarStatus } from '@/lib/use-calendar';
import { useToday } from '@/lib/use-today';

interface Editing {
  /** Entrada existente (null = dia novo). */
  entry: CalendarEntry | null;
  date: string;
}

function EntryDialog({
  editing,
  existingDates,
  hasPost,
  onViewPost,
  onSave,
  onDelete,
  onClose
}: {
  editing: Editing;
  existingDates: Set<string>;
  hasPost: boolean;
  onViewPost: (date: string) => void;
  onSave: (entry: CalendarEntry, previousDate: string | undefined, generate: boolean) => void;
  onDelete: (date: string) => void;
  onClose: () => void;
}) {
  const { entry } = editing;
  const [date, setDate] = useState(editing.date);
  const [ocasioes, setOcasioes] = useState((entry?.ocasioes ?? []).join('\n'));
  const [objetivo, setObjetivo] = useState(entry?.objetivo ?? '');
  const [detalhes, setDetalhes] = useState(entry?.detalhes ?? '');
  const [status, setStatus] = useState<EntryStatus>(entry?.status ?? 'pendente');
  const [error, setError] = useState<string | null>(null);

  function commit(generate: boolean) {
    if (!isValidDate(date)) {
      setError('Escolha uma data válida.');
      return;
    }
    if (date !== entry?.date && existingDates.has(date)) {
      setError(`${formatDay(date)} já tem um post planejado. Abra esse dia para editar.`);
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
    onSave({ date, ocasioes: lines, objetivo, detalhes, status }, entry?.date, generate);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    commit(false);
  }

  return (
    <Modal
      title={entry ? `Post de ${formatDay(entry.date)}` : 'Novo dia no calendário'}
      description="Tudo o que você escrever aqui vai junto na geração do post. Use “Salvar e gerar post” para criar a arte agora, com o que está escrito."
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          {entry && (
            <button
              type="button"
              className="btn btn-quiet btn-danger"
              onClick={() => {
                if (window.confirm(`Remover o post de ${formatDay(entry.date)} do calendário?`)) onDelete(entry.date);
              }}
            >
              Remover
            </button>
          )}
          <span className="spacer" />
          {entry && hasPost && (
            <button type="button" className="btn btn-quiet" onClick={() => onViewPost(entry.date)}>
              Ver post gerado
            </button>
          )}
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancelar
          </button>
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
        <div className="field">
          <label htmlFor="e-date" className="label">
            Data da postagem
          </label>
          <input id="e-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="e-ocasioes" className="label">
            Datas comemorativas do dia
          </label>
          <textarea
            id="e-ocasioes"
            className="input textarea textarea-short"
            rows={4}
            value={ocasioes}
            placeholder={'Uma por linha. Ex.:\nDia do professor'}
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
              Detalhes para a IA (opcional)
            </label>
            <span className="counter">
              {detalhes.length}/{ENTRY_LIMITS.detalhes}
            </span>
          </div>
          <textarea
            id="e-detalhes"
            className="input textarea textarea-short"
            rows={3}
            maxLength={ENTRY_LIMITS.detalhes}
            value={detalhes}
            placeholder="Ex.: o que é o produto da campanha, o que destacar, o que não falar."
            onChange={(e) => setDetalhes(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="e-status" className="label">
            Situação
          </label>
          <select id="e-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as EntryStatus)}>
            {ENTRY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function ImportDialog({
  defaultYear,
  existingDates,
  onImport,
  onClose
}: {
  defaultYear: number;
  existingDates: Set<string>;
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

  const replaced = parsed ? parsed.entries.filter((e) => existingDates.has(e.date)).length : 0;

  return (
    <Modal
      title="Importar dias de um texto"
      description="Cole a lista do mês. Cada dia começa com a data. Depois da seta (->) vem o objetivo; as datas comemorativas vêm nas linhas de baixo ou na mesma linha, depois de ponto ou hífen."
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancelar
          </button>
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
            <h3 className="label">O que será importado</h3>
            <ul className="preview-list">
              {parsed.entries.map((e) => (
                <li key={e.date}>
                  <strong>{formatDay(e.date)}</strong>
                  <span>{e.objetivo || 'Sem objetivo informado'}</span>
                  <small>{e.ocasioes.join(' · ') || 'Sem datas comemorativas'}</small>
                  {existingDates.has(e.date) && <em>substitui o que já existe</em>}
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
  onClose
}: {
  entry: CalendarEntry | undefined;
  post: PostView;
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
      title={`Post de ${formatDay(post.date)}`}
      description={`Gerado ${new Date(post.savedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${format ? ` · ${format.label} (${format.width} × ${format.height})` : ''} · layout ${LAYOUT_LABELS[post.layout]}`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn btn-quiet btn-danger"
            onClick={() => {
              if (!window.confirm('Apagar o post salvo deste dia? O dia continua no calendário.')) return;
              void deletePost(post.date);
              if (entry?.status === 'gerado') setEntryStatus(post.date, 'pendente');
              onClose();
            }}
          >
            Apagar post
          </button>
          <span className="spacer" />
          <Link className="btn btn-quiet" href={`/?data=${post.date}&auto=1`}>
            Gerar de novo
          </Link>
          {entry && entry.status !== 'postado' && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setEntryStatus(post.date, 'postado');
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
          <div className="caption-head">
            <span className="label">Legenda</span>
            <button type="button" className={`btn btn-small btn-quiet${copied ? ' btn-ok' : ''}`} onClick={copy}>
              {copied ? 'Copiado' : 'Copiar legenda'}
            </button>
          </div>
          <textarea className="input textarea" rows={10} readOnly value={post.legenda} aria-label="Legenda do post" />
          <div className="actions">
            <a className="btn btn-primary" href={post.imageUrl} download={`post-${post.formatId}-${post.date}.png`}>
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
  today,
  post,
  onEdit,
  onView
}: {
  entry: CalendarEntry;
  today: string;
  post: PostView | undefined;
  onEdit: (entry: CalendarEntry) => void;
  onView: (date: string) => void;
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
        <button type="button" className="agenda-thumb" onClick={() => onView(entry.date)} aria-label={`Ver o post de ${formatDay(entry.date)}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.imageUrl} alt="" />
        </button>
      )}

      <div className="agenda-body">
        <div className="agenda-top">
          <h3>{entry.ocasioes.length ? entry.ocasioes[0] : entry.objetivo}</h3>
          <span className="badge" data-status={entry.status}>
            {entry.status === 'pendente' ? '' : '✓ '}
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
            <button type="button" className="btn btn-primary btn-small" onClick={() => onView(entry.date)}>
              Ver post
            </button>
          )}
          <Link className={`btn btn-small ${post ? 'btn-quiet' : 'btn-primary'}`} href={`/?data=${entry.date}&auto=1`}>
            {post ? 'Gerar de novo' : 'Gerar post'}
          </Link>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => onEdit(entry)}>
            Editar
          </button>
          <label className="status-pick">
            <span className="sr-only">Situação do post de {formatDay(entry.date)}</span>
            <select
              className="input input-small"
              value={entry.status}
              onChange={(e) => setEntryStatus(entry.date, e.target.value as EntryStatus)}
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

  const byDate = useMemo(() => new Map(entries.map((e) => [e.date, e])), [entries]);
  const existingDates = useMemo(() => new Set(entries.map((e) => e.date)), [entries]);

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
  const next = entries.find((e) => e.date >= today && e.status !== 'postado');
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

  async function handleSave(entry: CalendarEntry, previousDate: string | undefined, generate: boolean) {
    const error = await saveEntry(entry, previousDate);
    if (error) {
      setFailure(error);
      return;
    }
    setFailure(null);
    setEditing(null);
    const p = parseISO(entry.date);
    if (p) setView({ year: p.year, month: p.month });
    flash(`Post de ${formatDay(entry.date)} salvo.`);
    if (generate) router.push(`/?data=${entry.date}&auto=1`);
  }

  async function handleDelete(date: string) {
    setEditing(null);
    const error = await removeEntry(date);
    if (error) setFailure(error);
    else flash(`Post de ${formatDay(date)} removido.`);
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
    flash(`${list.length} ${list.length === 1 ? 'dia importado' : 'dias importados'}.`);
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
          <div>
            <h2 id="next-title" className="next-label">
              {next.date === today ? 'Para postar hoje' : 'Próximo post'}
            </h2>
            <p className="next-title">
              {formatDay(next.date)} · {next.ocasioes[0] ?? next.objetivo}
              {next.ocasioes.length > 1 && ` +${next.ocasioes.length - 1}`}
            </p>
            {next.objetivo && <p className="hint">{next.objetivo}</p>}
          </div>
          <Link className="btn btn-primary" href={`/?data=${next.date}&auto=1`}>
            Gerar post
          </Link>
        </section>
      )}

      <div className="cal-bar">
        <div className="cal-nav">
          <button type="button" className="btn btn-quiet btn-small" onClick={() => shift(-1)} aria-label="Mês anterior">
            ‹
          </button>
          <h2 className="cal-title">
            {MONTH_NAMES[month].charAt(0).toUpperCase() + MONTH_NAMES[month].slice(1)} de {year}
          </h2>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => shift(1)} aria-label="Próximo mês">
            ›
          </button>
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
            onClick={() => setEditing({ entry: null, date: today })}
          >
            Adicionar dia
          </button>
        </div>
      </div>

      <p className="cal-legend" aria-hidden="true">
        <span data-status="pendente">A fazer</span>
        <span data-status="gerado">✓ Gerado (com miniatura da arte)</span>
        <span data-status="postado">✓ Postado</span>
      </p>

      <div className="cal-grid" role="grid" aria-label={`Calendário de ${MONTH_NAMES[month]} de ${year}`}>
        {WEEKDAY_SHORT.map((d) => (
          <div key={d} className="cal-weekday" role="columnheader">
            {d}
          </div>
        ))}
        {weeks.flat().map((date, i) => {
          if (!date) return <div key={`blank-${i}`} className="cal-day cal-blank" aria-hidden="true" />;
          const entry = byDate.get(date);
          const day = Number(date.slice(8));
          return (
            <button
              key={date}
              type="button"
              className="cal-day"
              data-today={date === today}
              data-has={!!entry}
              data-post={!!posts[date]}
              data-status={entry?.status}
              aria-label={`${formatDay(date)}${entry ? `, ${entry.ocasioes[0] ?? entry.objetivo}, ${STATUS_LABELS[entry.status]}` : ', sem post planejado'}`}
              onClick={() => setEditing({ entry: entry ?? null, date })}
            >
              <span className="cal-num">{day}</span>
              {posts[date] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="cal-thumb" src={posts[date].imageUrl} alt="" />
              )}
              {entry && (
                <>
                  <span className="cal-chip">
                    <i aria-hidden="true" />
                    <span>{entry.ocasioes[0] ?? entry.objetivo}</span>
                    {entry.ocasioes.length > 1 && <b>+{entry.ocasioes.length - 1}</b>}
                  </span>
                  <span className="cal-state">
                    {entry.status === 'pendente' ? STATUS_LABELS.pendente : `✓ ${STATUS_LABELS[entry.status]}`}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <section aria-labelledby="agenda-title" className="agenda">
        <h2 id="agenda-title" className="q">
          Posts de {MONTH_NAMES[month]}
        </h2>
        {monthEntries.length === 0 ? (
          <p className="hint">
            Nenhum post planejado neste mês. Use &ldquo;Importar de um texto&rdquo; para colar a lista ou &ldquo;Adicionar
            dia&rdquo;.
          </p>
        ) : (
          <ul className="agenda-list">
            {monthEntries.map((entry) => (
              <EntryCard
                key={entry.date}
                entry={entry}
                today={today}
                post={posts[entry.date]}
                onEdit={(e) => setEditing({ entry: e, date: e.date })}
                onView={setViewing}
              />
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <EntryDialog
          key={editing.entry?.date ?? `new-${editing.date}`}
          editing={editing}
          existingDates={existingDates}
          hasPost={!!(editing.entry && posts[editing.entry.date])}
          onViewPost={(date) => {
            setEditing(null);
            setViewing(date);
          }}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditing(null)}
        />
      )}
      {viewing && posts[viewing] && (
        <ViewPostDialog
          key={viewing}
          entry={byDate.get(viewing)}
          post={posts[viewing]}
          onClose={() => setViewing(null)}
        />
      )}
      {importing && (
        <ImportDialog
          defaultYear={year}
          existingDates={existingDates}
          onImport={handleImport}
          onClose={() => setImporting(false)}
        />
      )}
    </main>
  );
}
