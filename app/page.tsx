'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import {
  DEFAULT_FORMAT_ID,
  DEFAULT_NETWORK,
  NETWORKS,
  NETWORK_LABELS,
  getFormat,
  getNetwork,
  type NetworkId,
  type PostFormat
} from '@/lib/formats';
import { LAYOUT_LABELS, formatKindOfSize, withoutLogos, type LayoutKind } from '@/lib/brand';
import { useBrand, useBrandConfigured, useBrandStatus } from '@/lib/use-brand';
import { useProviders } from '@/lib/use-providers';
import { useSampleCounts } from '@/lib/use-samples';
import { coverToPng } from '@/lib/image-tools';
import type { ArtMode } from '@/lib/samples';
import { MONTH_NAMES, STATUS_LABELS, entryKey, entryTopic, formatDay, needsWork, parseISO, parseSlot, toISO } from '@/lib/calendar';
import { setEntryStatus, useCalendar } from '@/lib/use-calendar';
import { savePost, updatePostCaption, usePostDetail, useSavedPosts } from '@/lib/post-store';
import { useQueryParam } from '@/lib/use-query-param';
import { useToday } from '@/lib/use-today';

type Provider = 'openai' | 'gemini' | 'claude';
type Step = 'idle' | 'texto' | 'arte';
type CopyState = 'idle' | 'copied' | 'failed';

interface GeneratedPost {
  titulo: string;
  usedProvider: string;
  imageUrl: string;
  fileName: string;
  format: PostFormat;
  layout: LayoutKind;
  imageProvider: string;
  imageWarning: string;
  /** Aviso sobre o modo da arte (caiu para o template, ou texto não conferido). Vazio se está tudo certo. */
  modoAviso: string;
  /** Modo que de fato fez a arte. */
  modo: ArtMode;
  imagePrompt: string;
  imageJson: string;
  postPrompt: string;
  postJson: string;
  brandJson: string;
}

const ART_MODE_OPTIONS: { id: ArtMode; label: string; hint: string }[] = [
  {
    id: 'referencias',
    label: 'IA com referências',
    hint: 'A IA de imagem cria a arte inteira (foto, textos, cards e logo) inspirada nos seus posts de exemplo, com composição própria do tema.'
  },
  {
    id: 'template',
    label: 'Por template',
    hint: 'A IA cria só a foto de fundo e a arte é montada por código, em um dos layouts fixos da marca.'
  }
];

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'claude', label: 'Claude' }
];

const OCCASIONS = [
  'Ano Novo',
  'Dia da Mulher',
  'Dia do Trabalho',
  'Dia das Mães',
  'Dia dos Namorados',
  'Dia dos Pais',
  'Independência do Brasil',
  'Dia das Crianças',
  'Dia do Professor',
  'Black Friday',
  'Natal'
];

const STEP_MESSAGES: Record<Exclude<Step, 'idle'>, string> = {
  texto: 'Escrevendo o texto…',
  arte: 'Montando a arte…'
};

/** Marca de tempo para nomear o arquivo baixado. */
function timestamp(): number {
  return Date.now();
}

async function errorFrom(res: Response, fallback: string): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string') {
      return data.error;
    }
  } catch {
    // resposta sem JSON
  }
  return fallback;
}

function CopyBlock({
  label,
  hint,
  value,
  mono = false,
  rows = 5
}: {
  label: string;
  hint: string;
  value: string;
  mono?: boolean;
  rows?: number;
}) {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      setState('failed');
    }
    timer.current = setTimeout(() => setState('idle'), 2500);
  }

  return (
    <div className="copyblock">
      <div className="caption-head">
        <label className="label" htmlFor={id}>
          {label}
        </label>
        <button type="button" className={`btn btn-small btn-quiet${state === 'copied' ? ' btn-ok' : ''}`} onClick={copy}>
          {state === 'copied' ? 'Copiado' : state === 'failed' ? 'Não foi possível copiar' : 'Copiar'}
        </button>
      </div>
      <textarea
        id={id}
        className={`input textarea${mono ? ' mono' : ''}`}
        style={{ minHeight: 0 }}
        rows={rows}
        value={value}
        readOnly
      />
      <p className="hint">{hint}</p>
    </div>
  );
}

function MiniRatio({ format }: { format: PostFormat }) {
  const k = 36 / Math.max(format.width, format.height);
  return (
    <span className="mini-slot" aria-hidden="true">
      <span className="mini" style={{ width: Math.round(format.width * k), height: Math.round(format.height * k) }} />
    </span>
  );
}

export default function GeneratorPage() {
  const brand = useBrand();
  const brandConfigured = useBrandConfigured();
  const { status: brandStatus } = useBrandStatus();
  const available = useProviders();
  // Dia do calendário que abriu esta tela (?data=AAAA-MM-DD); tema e objetivo vêm dele até a pessoa editar
  // e a posição dele no dia (?pos=1 ou 2): cada data aceita até 2 posts
  const dataParam = useQueryParam('data');
  const slot = parseSlot(useQueryParam('pos')) ?? 1;
  const calendar = useCalendar();
  const entry = dataParam ? calendar.find((e) => e.date === dataParam && e.slot === slot) : undefined;
  const today = useToday();
  // Posts que ainda pedem ação: os dos últimos 7 dias que ficaram para trás e os próximos
  const pending = (() => {
    const t = parseISO(today);
    if (!t) return [];
    const weekAgo = new Date(t.year, t.month, t.day - 7);
    const since = toISO(weekAgo.getFullYear(), weekAgo.getMonth(), weekAgo.getDate());
    return calendar.filter((e) => needsWork(e.status) && e.date >= since).slice(0, 3);
  })();
  const otherEntry = entry ? calendar.find((e) => e.date === entry.date && e.slot !== entry.slot) : undefined;
  const [topicDraft, setTopic] = useState<string | null>(null);
  const [objetivoDraft, setObjetivo] = useState<string | null>(null);
  const topic = topicDraft ?? (entry ? entryTopic(entry) || entry.objetivo : '');
  const objetivo = objetivoDraft ?? entry?.objetivo ?? '';

  // Post já gerado para este dia: reaparece ao voltar à tela
  const savedPosts = useSavedPosts();
  const savedForDay = entry ? savedPosts[entryKey(entry.date, entry.slot)] : undefined;
  const savedDetail = usePostDetail(entry?.date, entry?.slot, savedForDay?.savedAt);
  const savedFormat = savedForDay ? getFormat(savedForDay.formatId) : undefined;
  const restored: GeneratedPost | null =
    savedForDay && savedFormat
      ? {
          titulo: savedForDay.titulo,
          usedProvider: savedForDay.usedProvider,
          imageUrl: savedForDay.imageUrl,
          fileName: `post-${savedForDay.formatId}-${savedForDay.date}${savedForDay.slot > 1 ? `-${savedForDay.slot}` : ''}.png`,
          format: savedFormat,
          layout: savedForDay.layout,
          imageProvider: savedForDay.imageProvider,
          imageWarning: savedForDay.imageWarning,
          modoAviso: '',
          modo: 'template',
          imagePrompt: savedDetail?.imagePrompt ?? '',
          imageJson: savedDetail?.imageJson ?? '',
          postPrompt: savedDetail?.postPrompt ?? '',
          postJson: savedDetail?.postJson ?? '',
          brandJson: savedDetail?.brandJson ?? ''
        }
      : null;
  const [provider, setProvider] = useState<Provider>('openai');
  // Com posts de exemplo guardados, a arte com referências é o padrão; sem eles só o template funciona
  const sampleCounts = useSampleCounts();
  const hasSamples = sampleCounts.feed + sampleCounts.story > 0;
  const [artModeChoice, setArtModeChoice] = useState<ArtMode | null>(null);
  const artMode: ArtMode = hasSamples ? (artModeChoice ?? 'referencias') : 'template';
  const [networkId, setNetworkId] = useState<NetworkId>(DEFAULT_NETWORK);
  const [formatId, setFormatId] = useState(DEFAULT_FORMAT_ID);
  const [step, setStep] = useState<Step>('idle');
  const [generating, setGenerating] = useState<PostFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedPost | null>(null);
  const [captionEdit, setCaption] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');

  const abortRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const current = result ?? restored;
  const caption = captionEdit ?? savedForDay?.legenda ?? '';

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  // Se a IA escolhida não tem chave no servidor, usa a primeira que tem
  const activeProvider: Provider = available[provider]
    ? provider
    : (PROVIDERS.find((p) => available[p.id])?.id ?? provider);

  const network = getNetwork(networkId);
  const selected = getFormat(formatId) ?? network.formats[0];
  const loading = step !== 'idle';
  const stepMessage =
    step === 'idle'
      ? ''
      : step === 'texto' && artMode === 'referencias'
        ? 'Escrevendo o texto e criando a arte com a IA (pode levar cerca de um minuto)…'
        : STEP_MESSAGES[step];
  const shown = generating ?? current?.format ?? selected;
  const hasSafeArea = shown.safeTop > 0 || shown.safeBottom > 0;
  const showEmpty = !loading && !current;
  const outdated = !loading && current !== null && current.format.id !== selected.id;

  function chooseNetwork(id: NetworkId) {
    const next = getNetwork(id);
    // Mantém o mesmo tipo de formato (ex.: Story → Story) quando a nova rede tem
    const sameLabel = next.formats.find((f) => f.label === selected.label);
    setNetworkId(id);
    setFormatId((sameLabel ?? next.formats[0]).id);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void generate();
  }

  async function generate() {
    if (loading) return;
    if (!topic.trim()) {
      setError('Escolha uma data comemorativa ou escreva o tema do post.');
      document.getElementById('topic')?.focus();
      return;
    }

    const format = selected;
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setError(null);
    setGenerating(format);
    setStep('texto');

    if (window.matchMedia('(max-width: 1179px)').matches) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      stageRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          objetivo: objetivo.trim(),
          detalhes: entry?.detalhes ?? '',
          dataPost: entry?.date,
          provider: activeProvider,
          formato: format.id,
          modoArte: artMode,
          brand: withoutLogos(brand)
        }),
        signal
      });
      if (!res.ok) throw new Error(await errorFrom(res, 'Não foi possível gerar o texto do post.'));
      const data = await res.json();

      setStep('arte');
      let blob: Blob;
      if (data.modo === 'referencias' && data.artImageUrl) {
        // A IA já entregou a arte pronta; só ajustamos ao tamanho exato do formato
        blob = await coverToPng(data.artImageUrl, format.width, format.height);
      } else {
        const og = await fetch('/api/og', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            layout: data.layout,
            eyebrow: data.eyebrow,
            titulo: data.titulo,
            subtitulo: data.subtitulo,
            itens: data.itens,
            cta: data.cta,
            bgUrl: data.bgImageUrl,
            formato: format.id,
            brand
          }),
          signal
        });
        if (!og.ok) throw new Error(await errorFrom(og, 'Não foi possível montar a arte do post.'));
        blob = await og.blob();
      }
      const imageUrl = URL.createObjectURL(blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = imageUrl;

      setResult({
        titulo: String(data.titulo).replace(/\*\*/g, ''),
        usedProvider: data.usedProvider,
        imageUrl,
        fileName: `post-${format.id}-${timestamp()}.png`,
        format,
        layout: data.layout,
        imageProvider: data.imageProvider,
        imageWarning: data.imageWarning ?? '',
        modoAviso: data.modoAviso ?? '',
        modo: data.modo === 'referencias' ? 'referencias' : 'template',
        imagePrompt: data.imagePrompt,
        imageJson: JSON.stringify(data.imageJson, null, 2),
        postPrompt: data.postPrompt,
        postJson: JSON.stringify(data.postJson, null, 2),
        brandJson: JSON.stringify(data.brand, null, 2)
      });
      setCaption(data.legenda);
      setCopyState('idle');
      if (entry) {
        void savePost({
          date: entry.date,
          slot: entry.slot,
          titulo: String(data.titulo).replace(/\*\*/g, ''),
          layout: data.layout,
          formatId: format.id,
          legenda: data.legenda,
          usedProvider: data.usedProvider,
          imageProvider: data.imageProvider,
          imageWarning: data.imageWarning ?? '',
          imagePrompt: data.imagePrompt,
          imageJson: JSON.stringify(data.imageJson, null, 2),
          postPrompt: data.postPrompt,
          postJson: JSON.stringify(data.postJson, null, 2),
          brandJson: JSON.stringify(data.brand, null, 2),
          image: blob
        }).then((failure) => {
          if (failure) setError(`A arte foi gerada, mas não foi salva no banco: ${failure}`);
        });
      }
      if (entry?.status === 'pendente') setEntryStatus(entry, 'gerado');
    } catch (err) {
      if (signal.aborted) return;
      setError(
        err instanceof TypeError
          ? 'Não foi possível falar com o servidor. Verifique a conexão e tente de novo.'
          : err instanceof Error
            ? err.message
            : 'Erro desconhecido.'
      );
    } finally {
      if (abortRef.current === controller) {
        setStep('idle');
        setGenerating(null);
      }
    }
  }

  // Vindo do calendário com ?auto=1, a geração começa sozinha com o que está escrito no dia
  const autoParam = useQueryParam('auto');
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoParam !== '1' || !entry || autoStarted.current) return;
    autoStarted.current = true;
    // Tira o auto da URL para que recarregar a página não gere de novo
    window.history.replaceState(null, '', `/?data=${entry.date}&pos=${entry.slot}`);
    void generate();
    // generate é recriada a cada renderização; aqui só importa o momento em que o dia carrega
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoParam, entry]);

  async function copyCaption() {
    if (!caption) return;
    if (copyTimer.current) clearTimeout(copyTimer.current);
    try {
      await navigator.clipboard.writeText(caption);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    copyTimer.current = setTimeout(() => setCopyState('idle'), 2500);
  }

  const captionFormat = current?.format ?? selected;
  const limit = captionFormat.captionLimit;
  const over = limit !== undefined && caption.length > limit;

  return (
    <main className="shell">
      <header className="masthead">
        <h1>Criar post</h1>
        <p className="lead">Escolha o tema e a rede. A arte sai no padrão da marca e já no tamanho certo.</p>
      </header>

      {brandStatus === 'ready' && !brandConfigured && (
        <p className="callout">
          <strong>A IA ainda não conhece a sua marca.</strong> Envie alguns posts que a empresa já publicou para ela
          aprender o padrão. <Link href="/marca">Configurar identidade visual</Link>
        </p>
      )}

      {!dataParam && pending.length > 0 && (
        <section className="today-strip" aria-labelledby="today-title">
          <h2 id="today-title" className="today-title">
            Para postar
          </h2>
          <ul className="today-list">
            {pending.map((e) => {
              const p = parseISO(e.date)!;
              const late = e.date < today;
              const label = e.ocasioes[0] ?? e.objetivo;
              return (
                <li key={entryKey(e.date, e.slot)} className="today-item" data-when={e.date === today ? 'today' : late ? 'late' : 'soon'}>
                  <div className="today-date" aria-hidden="true">
                    <strong>{p.day}</strong>
                    <span>{MONTH_NAMES[p.month].slice(0, 3)}</span>
                  </div>
                  <div className="today-body">
                    <strong title={label}>{label}</strong>
                    <span className="today-meta">
                      <span className="badge" data-status={e.status}>
                        {STATUS_LABELS[e.status]}
                      </span>
                      {e.date === today && <span className="badge badge-today">Hoje</span>}
                      {late && <span className="badge badge-late">Atrasado</span>}
                      <span className="sr-only">, {formatDay(e.date)}</span>
                    </span>
                  </div>
                  {/* Link comum: recarrega a tela para começar este post do zero */}
                  <a
                    className={`btn btn-small ${e.status === 'pendente' ? 'btn-primary' : 'btn-quiet'}`}
                    href={`/?data=${e.date}&pos=${e.slot}${e.status === 'pendente' ? '&auto=1' : ''}`}
                  >
                    {e.status === 'pendente' ? 'Gerar post' : 'Ver post'}
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="workbench">
        <form className="controls" onSubmit={handleSubmit} noValidate>
          {entry && (
            <div className="block">
              <div className="day-card">
                <div className="day-card-head">
                  <strong>Post de {formatDay(entry.date, true)}</strong>
                  <Link href="/calendario">Editar no calendário</Link>
                </div>
                {otherEntry && (
                  <p className="hint">
                    Este é o {entry.slot}º dos 2 posts do dia.{' '}
                    {/* Link comum: recarrega a tela para começar o outro post do zero */}
                    <a href={`/?data=${otherEntry.date}&pos=${otherEntry.slot}`}>
                      Abrir o {otherEntry.slot}º post: {otherEntry.ocasioes[0] ?? otherEntry.objetivo}
                    </a>
                  </p>
                )}
                {entry.ocasioes.length > 1 && (
                  <div>
                    <p className="hint">Este dia tem várias datas. Use todas ou escolha uma:</p>
                    <div className="chips">
                      <button
                        type="button"
                        className="chip"
                        aria-pressed={topic === entryTopic(entry)}
                        onClick={() => setTopic(entryTopic(entry))}
                      >
                        Todas
                      </button>
                      {entry.ocasioes.map((o) => (
                        <button key={o} type="button" className="chip" aria-pressed={topic === o} onClick={() => setTopic(o)}>
                          {o}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {entry.detalhes && <p className="hint">Detalhes enviados à IA: {entry.detalhes}</p>}
              </div>
            </div>
          )}

          <div className="block">
            <label className="q" htmlFor="topic">
              <span className="step-num" aria-hidden="true">
                1
              </span>
              Sobre o que é o post?
            </label>
            <input
              id="topic"
              className="input"
              type="text"
              value={topic}
              maxLength={500}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Ex.: Dia da Mulher"
              aria-describedby={error ? 'form-error' : undefined}
            />
            {!entry && (
              <div className="chips">
                {OCCASIONS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="chip"
                    aria-pressed={topic === name}
                    onClick={() => setTopic(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
            <label className="sub-q" htmlFor="objetivo">
              O que você quer com este post? <span className="optional">(opcional)</span>
            </label>
            <input
              id="objetivo"
              className="input"
              type="text"
              value={objetivo}
              maxLength={300}
              onChange={(e) => setObjetivo(e.target.value)}
              placeholder="Ex.: postar para engajamento"
            />
          </div>

          <div className="block">
            <fieldset className="fs">
              <legend className="q">
                <span className="step-num" aria-hidden="true">
                  2
                </span>
                Onde vai publicar?
              </legend>
              <div className="row" role="presentation">
                {NETWORKS.map((n) => (
                  <label key={n.id} className="pick">
                    <input
                      type="radio"
                      name="rede"
                      value={n.id}
                      checked={networkId === n.id}
                      onChange={() => chooseNetwork(n.id)}
                    />
                    <span className="face face-pill">{n.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {brandStatus === 'ready' && brandConfigured && formatKindOfSize(selected.width, selected.height) === 'story' && brand.layoutsStory.length === 0 && (
              <p className="callout" role="note">
                <strong>A marca ainda não tem padrão de story.</strong> Este story usa os layouts do feed. Em{' '}
                <Link href="/marca">Identidade</Link>, use “Analisar novos posts” e envie alguns stories.
              </p>
            )}
            <fieldset className="fs fs-formats">
              <legend className="sub-q">Formato</legend>
              <div className="formats">
                {network.formats.map((f) => (
                  <label key={f.id} className="pick">
                    <input
                      type="radio"
                      name="formato"
                      value={f.id}
                      checked={selected.id === f.id}
                      onChange={() => setFormatId(f.id)}
                    />
                    <span className="face face-format">
                      <MiniRatio format={f} />
                      <span>
                        <strong>{f.label}</strong>
                        <small>
                          {f.width} × {f.height}
                        </small>
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="block">
            <fieldset className="fs">
              <legend className="sub-q">Como criar a arte?</legend>
              <div className="row">
                {ART_MODE_OPTIONS.map((m) => {
                  const disabled = m.id === 'referencias' && !hasSamples;
                  return (
                    <label key={m.id} className="pick">
                      <input
                        type="radio"
                        name="modo-arte"
                        value={m.id}
                        checked={artMode === m.id}
                        disabled={disabled}
                        onChange={() => setArtModeChoice(m.id)}
                      />
                      <span className="face face-pill">{disabled ? `${m.label} (sem referências)` : m.label}</span>
                    </label>
                  );
                })}
              </div>
              <p className="hint">{ART_MODE_OPTIONS.find((m) => m.id === artMode)?.hint}</p>
              {!hasSamples && (
                <p className="hint">
                  Para usar referências, guarde posts de exemplo em <Link href="/marca">Identidade</Link> com “Analisar novos posts”.
                </p>
              )}
            </fieldset>
          </div>

          <details className="adjust">
            <summary>Ajustes</summary>
            <fieldset className="fs">
              <legend className="sub-q">IA que escreve o texto</legend>
              <div className="row">
                {PROVIDERS.map((p) => (
                  <label key={p.id} className="pick">
                    <input
                      type="radio"
                      name="modelo"
                      value={p.id}
                      checked={activeProvider === p.id}
                      disabled={!available[p.id]}
                      onChange={() => setProvider(p.id)}
                    />
                    <span className="face face-pill">{available[p.id] ? p.label : `${p.label} (sem chave)`}</span>
                  </label>
                ))}
              </div>
              <p className="hint">Se essa IA falhar, a próxima disponível assume.</p>
            </fieldset>
          </details>

          <div className="actionbar">
            {error && (
              <p id="form-error" role="alert" className="error">
                {error}
              </p>
            )}
            <div className="actionbar-row">
              <p className="actionbar-note">
                {NETWORK_LABELS[selected.network]} · {selected.label}
                <small>
                  {selected.width} × {selected.height}
                </small>
              </p>
              <button type="submit" className="btn btn-primary" aria-disabled={loading}>
                {loading && <span className="spinner" aria-hidden="true" />}
                {loading ? 'Gerando…' : current ? 'Gerar de novo' : 'Gerar post'}
              </button>
            </div>
          </div>
        </form>

        <div className="stage-col" ref={stageRef}>
          <div>
            <div className="stage-head">
              <h2 className="q">Como o post vai ficar?</h2>
              <span className="stage-size">
                {`${NETWORK_LABELS[shown.network]}, ${shown.label}: ${shown.width} × ${shown.height}`}
              </span>
            </div>
          </div>

          <div>
            <div className="desk">
              <div
                className="plate"
                style={
                  {
                    '--w': shown.width,
                    '--h': shown.height,
                    '--safe-top': shown.safeTop,
                    '--safe-bottom': shown.safeBottom
                  } as React.CSSProperties
                }
              >
                <span className="mark mark-tl" aria-hidden="true" />
                <span className="mark mark-tr" aria-hidden="true" />
                <span className="mark mark-bl" aria-hidden="true" />
                <span className="mark mark-br" aria-hidden="true" />

                <div className="sheet" data-empty={!current || loading} aria-busy={loading}>
                  {current && !loading && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="sheet-img" src={current.imageUrl} alt={`Arte do post: ${current.titulo}`} />
                  )}

                  {showEmpty && (
                    <div className="sheet-empty">
                      <strong>
                        {shown.width} × {shown.height}
                      </strong>
                      <span>Escolha o tema e toque em Gerar post para ver a arte aqui.</span>
                    </div>
                  )}

                  {loading && (
                    <div className="sheet-loading">
                      <div className="sheet-loading-body">
                        <span>{stepMessage}</span>
                        <ol className="steps" aria-hidden="true">
                          <li data-state={step === 'texto' ? 'now' : 'done'}>Texto</li>
                          <li data-state={step === 'arte' ? 'now' : 'next'}>Arte</li>
                        </ol>
                      </div>
                    </div>
                  )}

                  {hasSafeArea && (
                    <>
                      <span className="safe safe-top" aria-hidden="true" />
                      <span className="safe safe-bottom" aria-hidden="true" />
                    </>
                  )}
                </div>
              </div>
            </div>
            {hasSafeArea && (
              <p className="legend">Faixas tracejadas: a interface do app cobre essas áreas, então nada importante fica nelas.</p>
            )}
          </div>

          <p className="notice" role="status">
            {stepMessage}
            {outdated && current
              ? `Este post foi feito para ${current.format.label} (${NETWORK_LABELS[current.format.network]}). Gere de novo para usar ${selected.label}.`
              : ''}
          </p>

          {current && !loading && (
            <>
              <span className="confirm">
                {result ? 'Pronto' : 'Post salvo deste dia'}, gerado com {current.usedProvider} ·{' '}
                {current.imageProvider.includes('arte completa')
                  ? 'arte criada pela IA com referências'
                  : `layout ${LAYOUT_LABELS[current.layout]}`}
              </span>
              {current.modoAviso && (
                <p role="alert" className="callout">
                  <strong>{current.modo === 'template' ? 'A arte saiu pelo template.' : 'Confira a arte.'}</strong>{' '}
                  {current.modoAviso}
                </p>
              )}
              {current.imageWarning && (
                <p role="alert" className="callout">
                  <strong>A foto de fundo é um placeholder.</strong> {current.imageWarning} O prompt e o JSON abaixo
                  continuam valendo para gerar a foto em outra IA.
                </p>
              )}

              <div>
                <div className="caption-head">
                  <label className="q" htmlFor="legenda">
                    {captionFormat.hasCaption ? 'Legenda do post' : 'Texto de apoio'}
                  </label>
                  <span className="counter" data-over={over} id="legenda-contador">
                    {limit !== undefined
                      ? `${caption.length} de ${limit} caracteres${over ? ', acima do limite' : ''}`
                      : `${caption.length} caracteres`}
                  </span>
                </div>
                <textarea
                  id="legenda"
                  className="input textarea"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  onBlur={() => {
                    if (entry) void updatePostCaption(entry.date, entry.slot, caption);
                  }}
                  aria-describedby="legenda-contador"
                />
                {!captionFormat.hasCaption && (
                  <p className="hint">Este formato não tem legenda. Use o texto de apoio se precisar de uma mensagem junto.</p>
                )}
                <div className="actions">
                  <button
                    type="button"
                    className={`btn btn-quiet${copyState === 'copied' ? ' btn-ok' : ''}`}
                    onClick={copyCaption}
                  >
                    {copyState === 'copied'
                      ? 'Copiado'
                      : copyState === 'failed'
                        ? 'Não foi possível copiar'
                        : captionFormat.hasCaption
                          ? 'Copiar legenda'
                          : 'Copiar texto'}
                  </button>
                  <a className="btn btn-primary" href={current.imageUrl} download={current.fileName}>
                    Baixar PNG
                  </a>
                </div>
              </div>

              <section className="reuse" aria-labelledby="reuse-title">
                <h2 className="q" id="reuse-title">
                  Para gerar a arte pronta em outra IA
                </h2>
                {current.postPrompt ? (
                  <>
                    <p className="hint">
                      Cole no ChatGPT ou no Gemini com a <strong>logo</strong> e 2 ou 3 <strong>posts de referência</strong> anexados.
                      Este prompt descreve o post inteiro: foto, textos, cards, logo e desenho de fundo.
                    </p>
                    {brand.logo && (
                      <div className="actions">
                        <a className="btn btn-quiet btn-small" href={brand.logo} download={`logo-${brand.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`}>
                          Baixar a logo para anexar
                        </a>
                      </div>
                    )}
                    <CopyBlock
                      label="Prompt do post completo"
                      hint="Os textos estão escritos exatamente como devem aparecer na imagem."
                      value={current.postPrompt}
                      rows={14}
                    />
                    <CopyBlock
                      label="JSON do post completo"
                      hint="A mesma informação em formato estruturado, para ferramentas que aceitam JSON."
                      value={current.postJson}
                      mono
                      rows={12}
                    />
                  </>
                ) : (
                  <p className="hint">Este post foi salvo antes do prompt completo existir. Gere de novo para obtê-lo.</p>
                )}

                <details className="more">
                  <summary>Só a foto de fundo (sem textos nem logo) e identidade usada</summary>
                  <p className="hint">Fundo gerado por {current.imageProvider}. Use isto se quiser apenas a foto e montar a arte aqui no app.</p>
                  <CopyBlock
                    label="Prompt da foto"
                    hint="Já inclui o estilo, as cores e o formato da marca."
                    value={current.imagePrompt}
                    rows={6}
                  />
                  <CopyBlock
                    label="JSON da foto"
                    hint="O mesmo prompt dividido em assunto, cena, luz, câmera e composição, com o prompt negativo."
                    value={current.imageJson}
                    mono
                    rows={12}
                  />
                  <CopyBlock
                    label="Identidade visual usada"
                    hint="As configurações da marca que entraram neste post."
                    value={current.brandJson}
                    mono
                    rows={8}
                  />
                </details>
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
