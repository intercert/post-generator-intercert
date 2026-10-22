'use client';

import { useEffect, useRef, useState } from 'react';
import BrandModal from '@/components/BrandModal';
import {
  FORMAT_KIND_LABELS,
  HIGHLIGHT_LABELS,
  LAYOUT_LABELS,
  LOGO_POSITION_LABELS,
  MOTIF_LABELS,
  formatKindOfSize,
  layoutsFor,
  type Brand,
  type ColorKey,
  type FormatKind
} from '@/lib/brand';
import { cropToPng, dominantColors, fileToJpeg, thumbnailJpeg, type LogoBox } from '@/lib/image-tools';
import { isPdf, renderPdfPages } from '@/lib/pdf-tools';
import { resetBrand, saveBrand, useBrand, useBrandConfigured, useBrandStatus } from '@/lib/use-brand';
import { useProviders } from '@/lib/use-providers';
import { MAX_SAMPLES_PER_KIND, SAMPLE_KINDS, SAMPLE_KIND_LABELS, SAMPLE_MAX_SIDE, type SampleInput } from '@/lib/samples';
import { clearSampleCounts, saveSamples, useSampleCounts } from '@/lib/use-samples';

type Provider = 'claude' | 'openai' | 'gemini';

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'claude', label: 'Claude' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Gemini' }
];

const MAX_IMAGES = 12;

interface Upload {
  id: string;
  /** Nome do arquivo de origem. */
  name: string;
  /** Texto curto para a miniatura (ex.: "pág. 3"). */
  caption: string;
  /** Post publicado ou página de um manual de identidade visual. */
  origem: 'post' | 'manual';
  /** Feed ou story (só vale para posts). Detectado pela proporção; a pessoa pode trocar. */
  formato: FormatKind;
  dataUrl: string;
}

interface Draft {
  brand: Brand;
  notes: string[];
  source: string;
  /** Referências (miniaturas) dos arquivos analisados; só vão para o banco quando a pessoa salva. */
  samples: SampleInput[];
}

/** Escolhe até `max` itens espalhados pela lista inteira, para a amostra não ser só os primeiros arquivos. */
function spread<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  return Array.from({ length: max }, (_, i) => items[Math.floor((i * items.length) / max)]);
}

/** Reduz os arquivos enviados a poucas miniaturas por tipo (feed, story, manual) para usar de referência. */
async function buildSamples(uploads: Upload[]): Promise<SampleInput[]> {
  const samples: SampleInput[] = [];
  for (const tipo of SAMPLE_KINDS) {
    const ofKind = uploads.filter((u) => (u.origem === 'manual' ? 'manual' : u.formato) === tipo);
    for (const u of spread(ofKind, MAX_SAMPLES_PER_KIND)) {
      const thumb = await thumbnailJpeg(u.dataUrl, SAMPLE_MAX_SIDE);
      const nome = u.origem === 'manual' ? `${u.name}, ${u.caption}` : u.name;
      samples.push({ tipo, nome: nome.slice(0, 120), largura: thumb.width, altura: thumb.height, image: thumb.base64 });
    }
  }
  return samples;
}

const SWATCHES: { key: ColorKey; label: string }[] = [
  { key: 'corPrimaria', label: 'Principal' },
  { key: 'corDestaque', label: 'Destaque' },
  { key: 'corFundo', label: 'Fundo' },
  { key: 'corTexto', label: 'Texto' }
];

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

interface PaletteColor {
  name: string;
  hex: string;
  use: string;
}

/** Lê a paleta oficial ("Nome #RRGGBB (uso)", uma por linha); sem ela, mostra as quatro cores da arte. */
function parsePalette(brand: Brand): PaletteColor[] {
  const parsed: PaletteColor[] = [];
  for (const line of brand.paleta.split('\n')) {
    const m = /^(.*?)\s*(#[0-9a-fA-F]{6})\s*(?:\((.*)\))?\s*$/.exec(line.trim());
    if (m) parsed.push({ name: m[1].trim() || 'Cor', hex: m[2].toUpperCase(), use: (m[3] ?? '').trim() });
  }
  if (parsed.length) return parsed;
  return SWATCHES.map((sw) => ({ name: sw.label, hex: brand[sw.key].toUpperCase(), use: '' }));
}

const hexagon = (cx: number, cy: number, r: number) =>
  [0, 1, 2, 3, 4, 5]
    .map((i) => {
      const a = (Math.PI / 180) * (60 * i - 30);
      return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
    })
    .join(' ');

/** Desenho de fundo da faixa da marca: usa o motivo da própria identidade (hexágonos, círculos ou nada). */
function BoardPattern({ kind }: { kind: Brand['motivo'] }) {
  if (kind === 'nenhum' || kind === 'grade') return null;
  return (
    <svg className="board-pattern" viewBox="0 0 600 240" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      {kind === 'hexagonos' ? (
        <>
          <polygon points={hexagon(470, 60, 118)} />
          <polygon points={hexagon(574, 214, 118)} />
          <polygon points={hexagon(366, 214, 118)} />
        </>
      ) : (
        <>
          <circle cx="500" cy="90" r="120" />
          <circle cx="400" cy="230" r="90" />
        </>
      )}
    </svg>
  );
}

/** Arte de exemplo montada com a identidade salva, para a pessoa ver o resultado do aprendizado. */
function SamplePreview({ brand, formato, kind }: { brand: Brand; formato: string; kind: FormatKind }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const key = JSON.stringify(brand);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;

    fetch('/api/og', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        formato,
        layout: layoutsFor(brand, kind)[0].tipo,
        eyebrow: 'DATA COMEMORATIVA',
        titulo: 'Seu título com **destaque**',
        subtitulo: 'Frase de apoio que reforça a mensagem da marca.',
        itens: ['Primeiro item', 'Segundo item', 'Terceiro item'],
        cta: brand.cta,
        brand
      }),
      signal: controller.signal
    })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        objectUrl = URL.createObjectURL(await res.blob());
        setUrl(objectUrl);
        setFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // brand é lido pela chave serializada para não refazer a prévia à toa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const ratio = kind === 'story' ? '9 / 16' : '4 / 5';
  if (failed) return <p className="hint">Não foi possível montar a prévia agora.</p>;
  if (!url) return <div className="sample sample-loading" style={{ aspectRatio: ratio }} aria-busy="true" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="sample"
      style={{ aspectRatio: ratio }}
      src={url}
      alt={`Arte de exemplo de ${FORMAT_KIND_LABELS[kind].toLowerCase()} com a identidade visual salva`}
    />
  );
}

export default function BrandPage() {
  const saved = useBrand();
  const configured = useBrandConfigured();
  const { status: brandStatus } = useBrandStatus();
  const loadingBrand = brandStatus === 'loading';
  const available = useProviders();
  const sampleCounts = useSampleCounts();

  const [uploads, setUploads] = useState<Upload[]>([]);
  const [provider, setProvider] = useState<Provider>('claude');
  const [reading, setReading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [wantsUpload, setWantsUpload] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  const activeProvider: Provider = available[provider]
    ? provider
    : (PROVIDERS.find((p) => available[p.id])?.id ?? provider);
  const palette = parsePalette(saved);
  const feedCount = uploads.filter((u) => u.origem === 'post' && u.formato === 'feed').length;
  const storyCount = uploads.filter((u) => u.origem === 'post' && u.formato === 'story').length;
  const pageCount = uploads.filter((u) => u.origem === 'manual').length;
  const showUpload = !loadingBrand && (!configured || wantsUpload);
  const busy = reading || analyzing;

  function flash(message: string) {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setReading(true);
    try {
      let room = MAX_IMAGES - uploads.length;
      if (room <= 0) {
        setError(`Use no máximo ${MAX_IMAGES} imagens por análise (cada página de PDF conta como uma).`);
        return;
      }

      const loaded: Upload[] = [];
      const skipped: string[] = [];
      let cut = '';

      let leftOut = 0;
      for (const file of files) {
        if (room <= 0) {
          leftOut += 1;
          continue;
        }
        const id = `${file.name}-${file.size}-${file.lastModified}`;

        if (isPdf(file)) {
          const { pages, total } = await renderPdfPages(file, room);
          for (const page of pages) {
            loaded.push({ id: `${id}-p${page.page}-${Math.random()}`, name: file.name, caption: `pág. ${page.page}`, origem: 'manual', formato: 'feed', dataUrl: page.dataUrl });
          }
          room -= pages.length;
          if (total > pages.length) cut = `${file.name}: só as ${pages.length} primeiras de ${total} páginas foram lidas.`;
        } else if (file.type.startsWith('image/')) {
          const img = await fileToJpeg(file);
          loaded.push({
            id: `${id}-${Math.random()}`,
            name: file.name,
            caption: '',
            origem: 'post',
            formato: formatKindOfSize(img.width, img.height),
            dataUrl: img.dataUrl
          });
          room -= 1;
        } else {
          skipped.push(file.name);
        }
      }

      if (loaded.length === 0) {
        setError('Escolha imagens (JPG, PNG ou WebP) ou um manual em PDF.');
        return;
      }
      setUploads((current) => [...current, ...loaded]);
      const notes = [
        skipped.length ? `Ignorei: ${skipped.join(', ')} (formato não aceito).` : '',
        leftOut ? `${leftOut} ${leftOut === 1 ? 'arquivo não coube' : 'arquivos não couberam'} no limite de ${MAX_IMAGES} imagens. Remova algumas e envie de novo.` : '',
        cut
      ].filter(Boolean);
      if (notes.length) setError(notes.join(' '));
    } catch {
      setError('Não foi possível ler um dos arquivos. Se for um PDF, confira se ele abre normalmente e não tem senha.');
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function analyze() {
    if (uploads.length === 0 || busy) return;
    setError(null);
    setAnalyzing(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const urls = uploads.map((u) => u.dataUrl);
      const cores = await dominantColors(urls);

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagens: urls,
          origens: uploads.map((u) => u.origem),
          formatos: uploads.map((u) => u.formato),
          nomes: uploads.map((u) => (u.origem === 'manual' ? `${u.name}, ${u.caption}` : u.name)),
          cores,
          provider: activeProvider
        }),
        signal: controller.signal
      });
      if (!res.ok) throw new Error(await errorFrom(res, 'Não foi possível analisar os posts.'));
      const data: { perfil: Brand; logoBox: LogoBox | null; observacoes: string[]; usedProvider: string } =
        await res.json();

      let logo = '';
      const box = data.logoBox;
      const source = box ? urls[box.imagem - 1] : undefined;
      if (box && source) {
        try {
          logo = await cropToPng(source, box);
        } catch {
          // sem recorte: a pessoa envia a logo no modal
        }
      }

      const notes = [...data.observacoes];
      if (!logo) notes.push('Não consegui recortar a logo. Envie o arquivo da logo no passo "Logo".');

      // Ao reanalisar, o que a pessoa já preencheu à mão e a análise não traz não se perde.
      // E só se troca o padrão do tipo de post que foi enviado: stories sozinhos não apagam os layouts do feed,
      // e posts de feed sozinhos não apagam os de story.
      const sentFeed = uploads.some((u) => u.origem === 'post' && u.formato === 'feed');
      const sentStory = uploads.some((u) => u.origem === 'post' && u.formato === 'story');
      const found = data.perfil;
      const storyFound = found.layoutsStory.length ? found.layoutsStory : sentStory && !sentFeed ? found.layouts : [];
      const storyLogoFound = found.layoutsStory.length ? found.logoPosicaoStory : found.logoPosicao;

      const merged: Brand = configured
        ? {
            ...found,
            logo: logo || saved.logo,
            logoClara: saved.logoClara,
            conhecimento: saved.conhecimento,
            hashtags: saved.hashtags,
            instagram: found.instagram || saved.instagram,
            site: found.site || saved.site,
            layouts: sentFeed || !sentStory ? found.layouts : saved.layouts,
            logoPosicao: sentFeed || !sentStory ? found.logoPosicao : saved.logoPosicao,
            layoutsStory: storyFound.length ? storyFound : saved.layoutsStory,
            logoPosicaoStory: storyFound.length ? storyLogoFound : saved.logoPosicaoStory,
            paleta: found.paleta || saved.paleta,
            manual: found.manual || saved.manual
          }
        : { ...found, logo };
      let samples: SampleInput[] = [];
      try {
        samples = await buildSamples(uploads);
      } catch {
        notes.push('Não consegui guardar as miniaturas dos posts como referência; a identidade será salva sem elas.');
      }
      setDraft({ brand: merged, notes, source: `Analisado por ${data.usedProvider}`, samples });
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(
        err instanceof TypeError
          ? 'Não foi possível falar com o servidor. Verifique a conexão e tente de novo.'
          : err instanceof Error
            ? err.message
            : 'Erro desconhecido.'
      );
    } finally {
      if (abortRef.current === controller) setAnalyzing(false);
    }
  }

  async function handleSave(brand: Brand) {
    const samples = draft?.samples ?? [];
    const failure = await saveBrand(brand);
    setDraft(null);
    if (failure) {
      setError(failure);
      return;
    }
    const samplesFailure = await saveSamples(samples);
    setUploads([]);
    setWantsUpload(false);
    if (samplesFailure) {
      setError(`A identidade foi salva, mas as referências visuais não: ${samplesFailure}`);
      return;
    }
    flash('Identidade visual salva. Os próximos posts já seguem este padrão.');
  }

  async function handleReset() {
    if (!window.confirm('Voltar a identidade visual para o padrão? A identidade salva, inclusive a logo, será apagada.')) return;
    const failure = await resetBrand();
    if (failure) setError(failure);
    else {
      clearSampleCounts();
      flash('Identidade restaurada para o padrão.');
    }
  }

  return (
    <main className="shell">
      <header className="masthead">
        <h1>Identidade visual</h1>
        <p className="lead">
          Envie posts que a empresa já publicou. A IA analisa o padrão (logo, cores, layout, estilo das imagens e tom do
          texto) e passa a criar novos posts iguais, a partir só do tema.
        </p>
      </header>

      {loadingBrand && (
        <p className="hint" role="status">
          Carregando a identidade visual…
        </p>
      )}

      {notice && (
        <p className="notice-ok" role="status">
          {notice}
        </p>
      )}

      {configured && !wantsUpload && (
        <section className="board" aria-labelledby="board-title">
          <div className="board-hero">
            <BoardPattern kind={saved.motivo} />
            <div className="board-logo">
              {saved.logoClara || saved.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={saved.logoClara || saved.logo}
                  alt={`Logo de ${saved.nome}`}
                  data-on-brand={!!saved.logoClara}
                />
              ) : (
                <span>{saved.nome}</span>
              )}
            </div>
            <div className="board-name">
              <h2 id="board-title">{saved.nome}</h2>
              {saved.segmento && <p>{saved.segmento}</p>}
              {saved.subMarcas && <p className="board-sub">Sub-marcas: {saved.subMarcas}</p>}
            </div>
          </div>

          <div className="board-grid">
            <div className="board-main">
              <section aria-labelledby="palette-title">
                <h3 id="palette-title" className="board-h">
                  Cores
                </h3>
                <ul className="palette">
                  {palette.map((c) => (
                    <li key={`${c.name}-${c.hex}`}>
                      <span className="palette-chip" style={{ background: c.hex }} />
                      <strong>{c.name}</strong>
                      <code>{c.hex}</code>
                      {c.use && <small>{c.use}</small>}
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-labelledby="layouts-title">
                <h3 id="layouts-title" className="board-h">
                  Layouts
                </h3>
                <div className="layout-groups">
                  <div>
                    <h4 className="board-sub-h">Feed</h4>
                    <ul className="layout-summary">
                      {saved.layouts.map((l) => (
                        <li key={l.tipo}>
                          <strong>{LAYOUT_LABELS[l.tipo]}</strong>
                          <span>{l.quando || 'Sem descrição de uso.'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="board-sub-h">Story</h4>
                    {saved.layoutsStory.length > 0 ? (
                      <ul className="layout-summary">
                        {saved.layoutsStory.map((l) => (
                          <li key={l.tipo}>
                            <strong>{LAYOUT_LABELS[l.tipo]}</strong>
                            <span>{l.quando || 'Sem descrição de uso.'}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="hint">
                        Nenhum story foi analisado, então os stories usam os layouts do feed. Use “Analisar novos posts” e
                        envie alguns stories.
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <section aria-labelledby="style-title">
                <h3 id="style-title" className="board-h">
                  Estilo
                </h3>
                <dl className="facts">
                  <div>
                    <dt>Desenho de fundo</dt>
                    <dd>{MOTIF_LABELS[saved.motivo]}</dd>
                  </div>
                  <div>
                    <dt>Destaque no título</dt>
                    <dd>{HIGHLIGHT_LABELS[saved.destaqueEstilo]}</dd>
                  </div>
                  <div>
                    <dt>Logo no post</dt>
                    <dd>
                      Feed: {LOGO_POSITION_LABELS[saved.logoPosicao]}
                      {saved.layoutsStory.length > 0 && <>. Story: {LOGO_POSITION_LABELS[saved.logoPosicaoStory]}</>}
                    </dd>
                  </div>
                  <div>
                    <dt>Tom de voz</dt>
                    <dd>{saved.tomDeVoz}</dd>
                  </div>
                  <div>
                    <dt>Estilo das imagens</dt>
                    <dd>{saved.estiloImagem}</dd>
                  </div>
                  <div>
                    <dt>Referências da IA</dt>
                    <dd>
                      {SAMPLE_KINDS.some((k) => sampleCounts[k] > 0)
                        ? `Guardadas: ${SAMPLE_KINDS.filter((k) => sampleCounts[k] > 0)
                            .map((k) => `${sampleCounts[k]} ${SAMPLE_KIND_LABELS[k]}`)
                            .join(', ')}. A IA de imagem usa algumas delas para criar a arte completa.`
                        : 'Nenhuma guardada ainda. Use “Analisar novos posts” para a IA aprender com a arte dos seus posts.'}
                    </dd>
                  </div>
                  {saved.manual && (
                    <div>
                      <dt>Manual de identidade</dt>
                      <dd>Lido e salvo ({saved.manual.length} caracteres). Edite em “Editar identidade”.</dd>
                    </div>
                  )}
                </dl>
              </section>

              <div className="actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setDraft({ brand: saved, notes: [], source: '', samples: [] })}
                >
                  Editar identidade
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => setWantsUpload(true)}>
                  Analisar novos posts
                </button>
                <button type="button" className="btn btn-quiet" onClick={handleReset}>
                  Restaurar padrão
                </button>
              </div>
              <p className="hint">
                Guardada neste navegador. Em outro computador ou navegador, ela precisa ser feita de novo.
              </p>
            </div>

            <aside className="board-preview" aria-labelledby="sample-title">
              <h3 id="sample-title" className="board-h">
                Como um post fica
              </h3>
              <div className="sample-pair">
                <figure>
                  <SamplePreview brand={saved} formato="instagram-feed-retrato" kind="feed" />
                  <figcaption>Feed</figcaption>
                </figure>
                <figure>
                  <SamplePreview brand={saved} formato="instagram-story" kind="story" />
                  <figcaption>Story{saved.layoutsStory.length === 0 ? ' (padrão do feed)' : ''}</figcaption>
                </figure>
              </div>
              <p className="hint">Texto e foto de exemplo; no post de verdade a IA escreve o texto e gera a foto.</p>
            </aside>
          </div>
        </section>
      )}

      {showUpload && (
        <section className="upload" aria-labelledby="upload-title">
          <h2 id="upload-title" className="q">
            {configured ? 'Analisar novos posts' : 'Comece enviando alguns posts da empresa'}
          </h2>
          <p className="hint">
            Envie de 3 a 8 posts já publicados, de preferência de temas diferentes e em boa resolução. Misture posts de feed e <strong>stories</strong>: a IA aprende o padrão de cada um separadamente. Ela reconhece o tipo pela proporção da imagem, e você pode trocar clicando na etiqueta &quot;Feed&quot;/&quot;Story&quot; de cada miniatura. Se a empresa tem um{' '}
            <strong>manual de identidade visual em PDF</strong>, envie também: as regras dele (cores oficiais, fontes, uso da
            logo) valem mais que os posts e ficam salvas na identidade. Os arquivos em si não ficam guardados, mas ao salvar a
            identidade guardamos miniaturas de até {MAX_SAMPLES_PER_KIND} posts de feed, {MAX_SAMPLES_PER_KIND} stories e{' '}
            {MAX_SAMPLES_PER_KIND} páginas do manual: a IA de imagem usa algumas delas como referência visual para criar a
            arte completa de cada post.
          </p>

          <label
            className="dropzone"
            data-busy={reading}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void addFiles(e.dataTransfer.files);
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf,.pdf"
              multiple
              disabled={busy || uploads.length >= MAX_IMAGES}
              onChange={(e) => void addFiles(e.target.files)}
            />
            <strong>{reading ? 'Lendo os arquivos…' : 'Escolha os posts e o manual (PDF) ou arraste para cá'}</strong>
            <span>
{feedCount} de feed · {storyCount} stories · {pageCount} páginas de manual (limite de {MAX_IMAGES} imagens)
            </span>
          </label>

          {uploads.length > 0 && (
            <ul className="thumbs">
              {uploads.map((u) => (
                <li key={u.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u.dataUrl} alt={`${u.origem === 'manual' ? 'Página do manual' : 'Post enviado'}: ${u.name} ${u.caption}`} />
                  {u.origem === 'manual' ? (
                    <span className="thumb-tag">Manual · {u.caption}</span>
                  ) : (
                    <button
                      type="button"
                      className="thumb-kind"
                      data-kind={u.formato}
                      disabled={busy}
                      aria-label={`${u.name}: ${FORMAT_KIND_LABELS[u.formato]}. Clique para trocar.`}
                      onClick={() =>
                        setUploads((cur) =>
                          cur.map((x) => (x.id === u.id ? { ...x, formato: x.formato === 'story' ? 'feed' : 'story' } : x))
                        )
                      }
                    >
                      {FORMAT_KIND_LABELS[u.formato]}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Remover ${u.name}`}
                    disabled={busy}
                    onClick={() => setUploads((cur) => cur.filter((x) => x.id !== u.id))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <fieldset className="fs">
            <legend className="q">Qual IA faz a análise?</legend>
            <div className="row">
              {PROVIDERS.map((p) => (
                <label key={p.id} className="pick">
                  <input
                    type="radio"
                    name="analise"
                    value={p.id}
                    checked={activeProvider === p.id}
                    disabled={busy || !available[p.id]}
                    onChange={() => setProvider(p.id)}
                  />
                  <span className="face face-pill">{available[p.id] ? p.label : `${p.label} (sem chave)`}</span>
                </label>
              ))}
            </div>
            <p className="hint">Se esse modelo falhar, o próximo disponível assume.</p>
          </fieldset>

          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}

          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={analyze}
              aria-disabled={uploads.length === 0 || busy}
              disabled={uploads.length === 0 || busy}
            >
              {analyzing ? 'Analisando os posts…' : 'Analisar posts'}
            </button>
            {configured && (
              <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setWantsUpload(false)}>
                Voltar
              </button>
            )}
          </div>
          {analyzing && (
            <p className="hint" role="status">
              A IA está olhando cada post, em detalhes. Isso leva de 20 a 60 segundos.
            </p>
          )}
        </section>
      )}

      {draft && (
        <BrandModal
          initial={draft.brand}
          notes={draft.notes}
          source={draft.source}
          onSave={handleSave}
          onCancel={() => setDraft(null)}
        />
      )}
    </main>
  );
}
