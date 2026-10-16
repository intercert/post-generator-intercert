'use client';

import { useEffect, useRef, useState } from 'react';
import {
  COLOR_KEYS,
  FORMAT_KINDS,
  HIGHLIGHT_LABELS,
  HIGHLIGHT_STYLES,
  LAYOUT_HELP,
  LAYOUT_KINDS,
  LAYOUT_LABELS,
  LOGO_POSITIONS,
  LOGO_POSITION_LABELS,
  MOTIFS,
  MOTIF_LABELS,
  RADII,
  RADIUS_LABELS,
  SUPPORT_BOXES,
  SUPPORT_BOX_LABELS,
  TEXT_LIMITS,
  normalizeBrand,
  type Brand,
  type ColorKey,
  type FormatKind,
  type LayoutKind
} from '@/lib/brand';
import { fileToPng } from '@/lib/image-tools';

type TextKey = Exclude<keyof typeof TEXT_LIMITS, 'quando' | 'descricao'>;

const COLOR_LABELS: Record<ColorKey, { label: string; hint: string }> = {
  corPrimaria: { label: 'Cor principal', hint: 'Caixas escuras, fundos azuis.' },
  corDestaque: { label: 'Cor de destaque', hint: 'Palavra-chave, botões, faixas.' },
  corFundo: { label: 'Fundo claro', hint: 'Fundo dos posts claros.' },
  corTexto: { label: 'Texto sobre claro', hint: 'Títulos em fundo claro.' }
};

interface Props {
  initial: Brand;
  /** Pontos que a análise pediu para a pessoa conferir. */
  notes?: string[];
  /** Frase sobre a origem dos dados (ex.: "Analisado por Claude"). */
  source?: string;
  onSave: (brand: Brand) => void;
  onCancel: () => void;
}

function Field({
  id,
  label,
  hint,
  value,
  max,
  multiline,
  placeholder,
  onChange
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  max: number;
  multiline?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <div className="caption-head">
        <label htmlFor={id} className="label">
          {label}
        </label>
        <span className="counter">
          {value.length}/{max}
        </span>
      </div>
      {multiline ? (
        <textarea
          id={id}
          className="input textarea textarea-short"
          rows={max > 2000 ? 12 : max > 600 ? 6 : undefined}
          value={value}
          maxLength={max}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          className="input"
          type="text"
          value={value}
          maxLength={max}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

function Select<T extends string>({
  id,
  label,
  value,
  options,
  onChange
}: {
  id: string;
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function LogoPicker({
  title,
  hint,
  value,
  dark,
  onChange
}: {
  title: string;
  hint: string;
  value: string;
  dark?: boolean;
  onChange: (png: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      onChange(await fileToPng(file));
    } catch {
      setError('Não foi possível abrir esse arquivo. Use PNG, JPG ou SVG.');
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="logo-picker">
      <div className={`logo-preview${dark ? ' logo-preview-dark' : ''}`}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={`Pré-visualização: ${title}`} />
        ) : (
          <span>Sem arquivo</span>
        )}
      </div>
      <div className="logo-actions">
        <strong>{title}</strong>
        <small>{hint}</small>
        <div className="actions">
          <button type="button" className="btn btn-small btn-quiet" onClick={() => inputRef.current?.click()}>
            {value ? 'Trocar arquivo' : 'Enviar arquivo'}
          </button>
          {value && (
            <button type="button" className="btn btn-small btn-quiet" onClick={() => onChange('')}>
              Remover
            </button>
          )}
        </div>
        {error && <small className="text-danger">{error}</small>}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}

export default function BrandModal({ initial, notes = [], source, onSave, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Brand>(initial);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function set<K extends keyof Brand>(key: K, value: Brand[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const text = (key: TextKey, label: string, o: { hint?: string; multiline?: boolean; placeholder?: string } = {}) => (
    <Field
      id={`m-${key}`}
      label={label}
      value={draft[key]}
      max={TEXT_LIMITS[key]}
      onChange={(v) => set(key, v)}
      {...o}
    />
  );

  type LayoutField = 'layouts' | 'layoutsStory';

  function toggleLayout(field: LayoutField, tipo: LayoutKind, on: boolean) {
    setDraft((d) => ({
      ...d,
      [field]: on ? [...d[field], { tipo, quando: '', descricao: '' }] : d[field].filter((l) => l.tipo !== tipo)
    }));
  }

  function setLayoutField(field: LayoutField, tipo: LayoutKind, key: 'quando' | 'descricao', value: string) {
    setDraft((d) => ({ ...d, [field]: d[field].map((l) => (l.tipo === tipo ? { ...l, [key]: value } : l)) }));
  }

  /** Layouts e posição da logo de um tipo de post. O feed é obrigatório; o story é opcional. */
  function layoutSection(kind: FormatKind) {
    const story = kind === 'story';
    const field: LayoutField = story ? 'layoutsStory' : 'layouts';
    const positionKey = story ? 'logoPosicaoStory' : 'logoPosicao';
    const list = draft[field];

    return (
      <section className="modal-section" key={kind}>
        <h3>{story ? 'Layouts dos stories' : 'Layouts dos posts de feed'}</h3>
        <p className="hint">
          {story
            ? 'Stories são verticais (9:16) e costumam ter composição própria. Se você não marcar nenhum, os stories usam os layouts do feed.'
            : 'A IA escolhe um deles para cada tema. Marque ao menos um.'}
        </p>
        {(!story || list.length > 0) && (
          <div className="fields">
            <Select
              id={`m-${positionKey}`}
              label={story ? 'Onde a logo fica nos stories' : 'Onde a logo fica nos posts de feed'}
              value={draft[positionKey]}
              options={LOGO_POSITIONS.map((p) => [p, LOGO_POSITION_LABELS[p]] as const)}
              onChange={(v) => set(positionKey, v)}
            />
          </div>
        )}
        <div className="layout-list">
          {LAYOUT_KINDS.map((tipo) => {
            const current = list.find((l) => l.tipo === tipo);
            return (
              <div key={tipo} className="layout-item" data-on={!!current}>
                <label className="layout-check">
                  <input type="checkbox" checked={!!current} onChange={(e) => toggleLayout(field, tipo, e.target.checked)} />
                  <span>
                    <strong>{LAYOUT_LABELS[tipo]}</strong>
                    <small>{LAYOUT_HELP[tipo]}</small>
                  </span>
                </label>
                {current && (
                  <>
                    <input
                      className="input"
                      type="text"
                      aria-label={`Quando usar o layout ${LAYOUT_LABELS[tipo]} ${story ? 'nos stories' : 'no feed'}`}
                      value={current.quando}
                      maxLength={TEXT_LIMITS.quando}
                      placeholder="Quando a marca usa este layout"
                      onChange={(e) => setLayoutField(field, tipo, 'quando', e.target.value)}
                    />
                    <textarea
                      className="input textarea textarea-short"
                      rows={4}
                      aria-label={`Descrição visual do layout ${LAYOUT_LABELS[tipo]} ${story ? 'nos stories' : 'no feed'}`}
                      value={current.descricao}
                      maxLength={TEXT_LIMITS.descricao}
                      placeholder="Como é a composição: onde ficam foto, título, cards, lista e logo; cores e formas de cada elemento. Vai direto para o prompt do post completo."
                      onChange={(e) => setLayoutField(field, tipo, 'descricao', e.target.value)}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (draft.layouts.length === 0) return;
    onSave(normalizeBrand(draft));
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <form onSubmit={handleSubmit} noValidate className="modal-form">
        <header className="modal-head">
          <h2 id="modal-title">Confira o que a IA entendeu</h2>
          <p className="hint">
            {source ? `${source}. ` : ''}A IA pode errar uma letra do nome ou recortar a logo errada. Corrija o que for
            preciso; é isto que vai guiar todos os próximos posts.
          </p>
        </header>

        <div className="modal-body">
          {notes.length > 0 && (
            <div className="callout" role="note">
              <strong>A IA pediu para você conferir:</strong>
              <ul>
                {notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          <section className="modal-section">
            <h3>Empresa</h3>
            <div className="fields">
              {text('nome', 'Nome da empresa', { hint: 'Como aparece na logo.' })}
              {text('subMarcas', 'Sub-marcas ou produtos', { placeholder: 'Ex.: Gourmet, ERP, Ponto' })}
              {text('segmento', 'O que a empresa faz', { multiline: true })}
              {text('conhecimento', 'Produtos e campanhas (o que a IA precisa saber)', {
                multiline: true,
                hint: 'Ex.: o que é o Bird ID, o que a empresa vende, diferenciais. A IA usa só estes fatos ao falar dos produtos e não inventa o resto.'
              })}
              <div className="two">
                {text('instagram', 'Perfil nas redes', { placeholder: '@suaempresa' })}
                {text('site', 'Site', { placeholder: 'suaempresa.com.br' })}
              </div>
            </div>
          </section>

          <section className="modal-section">
            <h3>Logo</h3>
            <div className="fields">
              <LogoPicker
                title="Logo principal"
                hint="Recortada automaticamente das suas imagens ou do manual. Para a melhor qualidade, envie o arquivo original (PNG com fundo transparente)."
                value={draft.logo}
                onChange={(png) => set('logo', png)}
              />
              <LogoPicker
                title="Logo para fundo escuro (opcional)"
                hint="Usada sobre fotos e fundos escuros. Sem ela, a logo principal vai sobre uma pílula branca."
                value={draft.logoClara}
                dark
                onChange={(png) => set('logoClara', png)}
              />
              {text('logoDescricao', 'Como é a logo', {
                multiline: true,
                hint: 'Símbolo, cores e nome, para a IA de imagem não inventar uma logo diferente.'
              })}
            </div>
          </section>

          <section className="modal-section">
            <h3>Cores</h3>
            <p className="hint">As quatro cores abaixo são as que a arte do app usa. A paleta oficial completa fica salva à parte.</p>
            <div className="colors">
              {COLOR_KEYS.map((key) => (
                <div key={key} className="color">
                  <input
                    id={`m-${key}`}
                    type="color"
                    value={draft[key]}
                    onChange={(e) => set(key, e.target.value.toUpperCase())}
                  />
                  <label htmlFor={`m-${key}`}>
                    <strong>{COLOR_LABELS[key].label}</strong>
                    <small>
                      {draft[key]} · {COLOR_LABELS[key].hint}
                    </small>
                  </label>
                </div>
              ))}
            </div>
          </section>

          <section className="modal-section">
            <h3>Manual de identidade visual</h3>
            <div className="fields">
              {text('paleta', 'Paleta oficial', {
                multiline: true,
                hint: 'Uma cor por linha, com nome e código. Ex.: Laranja #F47C3B. Vem do manual, quando você envia o PDF.'
              })}
              {text('manual', 'Regras do manual (resumo salvo)', {
                multiline: true,
                hint: 'Logo, margens, usos proibidos, fontes e cores oficiais. Entra em todos os prompts, então o que estiver errado aqui se repete nos posts.'
              })}
            </div>
          </section>

          <section className="modal-section">
            <h3>Estilo dos posts</h3>
            <div className="fields">
              <div className="two">
                <Select
                  id="m-motivo"
                  label="Desenho de fundo"
                  value={draft.motivo}
                  options={MOTIFS.map((m) => [m, MOTIF_LABELS[m]] as const)}
                  onChange={(v) => set('motivo', v)}
                />
                <Select
                  id="m-raio"
                  label="Cantos arredondados"
                  value={draft.raio}
                  options={RADII.map((r) => [r, RADIUS_LABELS[r]] as const)}
                  onChange={(v) => set('raio', v)}
                />
                <Select
                  id="m-destaque"
                  label="Destaque no título"
                  value={draft.destaqueEstilo}
                  options={HIGHLIGHT_STYLES.map((h) => [h, HIGHLIGHT_LABELS[h]] as const)}
                  onChange={(v) => set('destaqueEstilo', v)}
                />
                <Select
                  id="m-caixa"
                  label="Caixa do texto de apoio"
                  value={draft.caixaApoio}
                  options={SUPPORT_BOXES.map((b) => [b, SUPPORT_BOX_LABELS[b]] as const)}
                  onChange={(v) => set('caixaApoio', v)}
                />
              </div>
              {text('motivoDetalhe', 'Desenho de fundo, em detalhe', {
                multiline: true,
                hint: 'Tamanho, opacidade e onde aparece. Ex.: hexágonos grandes, quase transparentes, cortados nas bordas.'
              })}
              {text('elementos', 'Elementos que se repetem', {
                multiline: true,
                hint: 'Ex.: rótulo em caixa alta com uma linha, ícones de check laranja nas listas, selos arredondados.'
              })}
              {text('cta', 'Fechamento que se repete', { placeholder: 'Ex.: Fale com a gente!' })}
              {text('tipografia', 'Tipografia', {
                multiline: true,
                hint: 'Só descritivo: a arte usa uma fonte sans-serif geométrica (Poppins).'
              })}
            </div>
          </section>

          {FORMAT_KINDS.map((kind) => layoutSection(kind))}

          <section className="modal-section">
            <h3>Imagens e texto</h3>
            <div className="fields">
              {text('estiloImagem', 'Estilo das imagens', {
                multiline: true,
                hint: 'Em inglês, vai direto para o gerador de imagens.'
              })}
              {text('tomDeVoz', 'Tom de voz', { multiline: true })}
              {text('evitar', 'O que evitar', { multiline: true })}
              {text('hashtags', 'Hashtags fixas', { placeholder: '#suaempresa' })}
            </div>
          </section>
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn btn-quiet" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={draft.layouts.length === 0}>
            Salvar identidade visual
          </button>
        </footer>
      </form>
    </dialog>
  );
}
