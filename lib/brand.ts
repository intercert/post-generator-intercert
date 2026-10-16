// Perfil de estilo da marca. Nasce da análise dos posts que a empresa já publicou, é revisado pela
// pessoa num modal e fica guardado no navegador. O servidor sempre revalida com normalizeBrand.

export const LAYOUT_KINDS = ['cartao', 'tela-cheia', 'produto'] as const;
export type LayoutKind = (typeof LAYOUT_KINDS)[number];

export const LAYOUT_LABELS: Record<LayoutKind, string> = {
  cartao: 'Cartão',
  'tela-cheia': 'Tela cheia',
  produto: 'Produto'
};

export const LAYOUT_HELP: Record<LayoutKind, string> = {
  cartao: 'Foto dentro de um cartão arredondado sobre fundo claro; o título fica numa caixa por cima.',
  'tela-cheia': 'A foto ocupa a arte toda; o título e a lista ficam em caixas coloridas por cima.',
  produto: 'Fundo dividido, logo grande no topo, imagem do produto ao centro e barra de funcionalidades.'
};

export const LOGO_POSITIONS = ['rodape-centro', 'rodape-direita', 'rodape-esquerda', 'topo-esquerda', 'topo-centro'] as const;
export type LogoPosition = (typeof LOGO_POSITIONS)[number];

export const LOGO_POSITION_LABELS: Record<LogoPosition, string> = {
  'rodape-centro': 'Rodapé, no centro',
  'rodape-direita': 'Rodapé, à direita',
  'rodape-esquerda': 'Rodapé, à esquerda',
  'topo-esquerda': 'Topo, à esquerda',
  'topo-centro': 'Topo, no centro'
};

/** Feed e story têm composições diferentes, então o padrão da marca é aprendido separadamente para cada um. */
export const FORMAT_KINDS = ['feed', 'story'] as const;
export type FormatKind = (typeof FORMAT_KINDS)[number];
export const FORMAT_KIND_LABELS: Record<FormatKind, string> = { feed: 'Feed', story: 'Story' };

/** Story é o vertical 9:16 (altura pelo menos 1,6 vez a largura); o resto conta como feed. */
export function formatKindOfSize(width: number, height: number): FormatKind {
  return width > 0 && height / width >= 1.6 ? 'story' : 'feed';
}

export const MOTIFS = ['hexagonos', 'circulos', 'grade', 'nenhum'] as const;
export type Motif = (typeof MOTIFS)[number];
export const MOTIF_LABELS: Record<Motif, string> = {
  hexagonos: 'Hexágonos',
  circulos: 'Círculos',
  grade: 'Linhas em grade',
  nenhum: 'Sem desenho de fundo'
};

export const RADII = ['pequeno', 'medio', 'grande'] as const;
export type Radius = (typeof RADII)[number];
export const RADIUS_LABELS: Record<Radius, string> = { pequeno: 'Pequeno', medio: 'Médio', grande: 'Grande' };

export const HIGHLIGHT_STYLES = ['caixa', 'texto'] as const;
export type HighlightStyle = (typeof HIGHLIGHT_STYLES)[number];
export const HIGHLIGHT_LABELS: Record<HighlightStyle, string> = {
  caixa: 'Palavra sobre uma caixa colorida',
  texto: 'Palavra em negrito colorido'
};

export const SUPPORT_BOXES = ['primaria', 'destaque'] as const;
export type SupportBox = (typeof SUPPORT_BOXES)[number];
export const SUPPORT_BOX_LABELS: Record<SupportBox, string> = {
  primaria: 'Cor principal',
  destaque: 'Cor de destaque'
};

export interface BrandLayout {
  tipo: LayoutKind;
  /** Em que tipo de post a marca usa este layout (texto da análise, editável). */
  quando: string;
  /** Descrição visual detalhada deste layout (posições, cards, cores), vinda da análise. */
  descricao: string;
}

export interface Brand {
  nome: string;
  subMarcas: string;
  segmento: string;
  /** Produtos, campanhas e fatos da empresa que a IA pode usar (ex.: o que é o Bird ID). */
  conhecimento: string;
  /** Como a logo é de verdade (símbolo, cores, nome), para o prompt do post completo. */
  logoDescricao: string;
  /** Como o desenho de fundo aparece de verdade (tamanho, opacidade, onde fica). */
  motivoDetalhe: string;
  /** Elementos que se repetem nos posts (selos, ícones de lista, fechamento...). */
  elementos: string;
  /** Paleta oficial, uma cor por linha (ex.: "Cadet Gray #989FA3"). Vem do manual, quando há. */
  paleta: string;
  /** Resumo do manual de identidade visual: regras de logo, margens, fontes, usos proibidos. */
  manual: string;
  instagram: string;
  site: string;

  /** PNG em data URL; vazio quando não há logo. */
  logo: string;
  /** Versão para fundos escuros (opcional). */
  logoClara: string;
  logoPosicao: LogoPosition;

  corPrimaria: string;
  corDestaque: string;
  corFundo: string;
  corTexto: string;

  motivo: Motif;
  destaqueEstilo: HighlightStyle;
  raio: Radius;
  caixaApoio: SupportBox;
  cta: string;
  /** Layouts vistos nos posts de feed. */
  layouts: BrandLayout[];
  /** Layouts vistos nos stories; vazio quando nenhum story foi analisado (aí valem os do feed). */
  layoutsStory: BrandLayout[];
  /** Posição da logo nos stories (só vale quando há layouts de story). */
  logoPosicaoStory: LogoPosition;

  tipografia: string;
  estiloImagem: string;
  tomDeVoz: string;
  evitar: string;
  hashtags: string;
}

export const BRAND_STORAGE_KEY = 'post-generator:brand:v2';

export const TEXT_LIMITS = {
  nome: 40,
  subMarcas: 120,
  segmento: 300,
  conhecimento: 1500,
  instagram: 40,
  site: 60,
  cta: 60,
  tipografia: 300,
  estiloImagem: 500,
  tomDeVoz: 300,
  evitar: 300,
  hashtags: 200,
  quando: 300,
  descricao: 900,
  logoDescricao: 500,
  motivoDetalhe: 600,
  elementos: 700,
  paleta: 500,
  manual: 6000
} as const;

export const COLOR_KEYS = ['corPrimaria', 'corDestaque', 'corFundo', 'corTexto'] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

export const MAX_LOGO_CHARS = 700_000;
const LOGO_PREFIX = 'data:image/png;base64,';
// Assinatura de um PNG de verdade (89 50 4E 47 0D 0A 1A 0A) em base64
const PNG_SIGNATURE_B64 = 'iVBORw0KGgo';

export const DEFAULT_BRAND: Brand = {
  nome: 'SUA EMPRESA',
  subMarcas: '',
  segmento: '',
  conhecimento: '',
  logoDescricao: '',
  motivoDetalhe: '',
  elementos: '',
  paleta: '',
  manual: '',
  instagram: '@suaempresa',
  site: 'suaempresa.com.br',
  logo: '',
  logoClara: '',
  logoPosicao: 'rodape-centro',
  corPrimaria: '#0052FF',
  corDestaque: '#00D084',
  corFundo: '#FFFFFF',
  corTexto: '#0B132B',
  motivo: 'nenhum',
  destaqueEstilo: 'texto',
  raio: 'medio',
  caixaApoio: 'primaria',
  cta: '',
  layouts: [
    { tipo: 'cartao', quando: 'Posts institucionais e datas comemorativas.', descricao: '' },
    { tipo: 'tela-cheia', quando: 'Posts de impacto com foto grande.', descricao: '' }
  ],
  layoutsStory: [],
  logoPosicaoStory: 'rodape-centro',
  tipografia: 'Sans-serif geométrica, títulos curtos alinhados à esquerda.',
  estiloImagem: 'Fotografia realista e limpa, luz natural suave, estilo corporativo moderno.',
  tomDeVoz: 'Profissional, institucional e próximo, sem gírias.',
  evitar: 'Texto dentro da imagem, marcas d’água, ilustração cartunesca.',
  hashtags: ''
};

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Aceita #RGB ou #RRGGBB e devolve #RRGGBB em maiúsculas; null se inválida. */
export function parseHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!HEX.test(v)) return null;
  const digits = v.slice(1);
  const full = digits.length === 3 ? [...digits].map((c) => c + c).join('') : digits;
  return `#${full.toUpperCase()}`;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Texto longo que preserva as quebras de linha (cleanText achata tudo em uma linha). */
function cleanMultiline(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  return value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

function cleanLogo(value: unknown): string {
  return typeof value === 'string' &&
    value.startsWith(LOGO_PREFIX + PNG_SIGNATURE_B64) &&
    value.length <= MAX_LOGO_CHARS
    ? value
    : '';
}

function cleanLayouts(value: unknown, fallbackToDefault = true): BrandLayout[] {
  const fallback = () => (fallbackToDefault ? DEFAULT_BRAND.layouts.map((l) => ({ ...l })) : []);
  if (!Array.isArray(value)) return fallback();
  const seen = new Set<LayoutKind>();
  const out: BrandLayout[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    const raw = record.tipo;
    if (typeof raw !== 'string' || !(LAYOUT_KINDS as readonly string[]).includes(raw)) continue;
    const tipo = raw as LayoutKind;
    if (seen.has(tipo)) continue;
    seen.add(tipo);
    out.push({
      tipo,
      quando: cleanText(record.quando, TEXT_LIMITS.quando) ?? '',
      descricao: cleanMultiline(record.descricao, TEXT_LIMITS.descricao) ?? ''
    });
  }
  return out.length ? out : fallback();
}

/** Valida cada campo; o que vier inválido volta ao padrão. Nunca lança erro. */
export function normalizeBrand(input: unknown): Brand {
  const s = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const d = DEFAULT_BRAND;
  const text = (key: keyof typeof TEXT_LIMITS, fallback: string) => cleanText(s[key], TEXT_LIMITS[key]) ?? fallback;

  const nome = text('nome', d.nome) || d.nome;

  return {
    nome,
    subMarcas: text('subMarcas', d.subMarcas),
    segmento: text('segmento', d.segmento),
    conhecimento: cleanMultiline(s.conhecimento, TEXT_LIMITS.conhecimento) ?? d.conhecimento,
    logoDescricao: cleanMultiline(s.logoDescricao, TEXT_LIMITS.logoDescricao) ?? d.logoDescricao,
    motivoDetalhe: cleanMultiline(s.motivoDetalhe, TEXT_LIMITS.motivoDetalhe) ?? d.motivoDetalhe,
    elementos: cleanMultiline(s.elementos, TEXT_LIMITS.elementos) ?? d.elementos,
    paleta: cleanMultiline(s.paleta, TEXT_LIMITS.paleta) ?? d.paleta,
    manual: cleanMultiline(s.manual, TEXT_LIMITS.manual) ?? d.manual,
    instagram: text('instagram', d.instagram),
    site: text('site', d.site),
    logo: cleanLogo(s.logo),
    logoClara: cleanLogo(s.logoClara),
    logoPosicao: pick(s.logoPosicao, LOGO_POSITIONS, d.logoPosicao),
    corPrimaria: parseHex(s.corPrimaria) ?? d.corPrimaria,
    corDestaque: parseHex(s.corDestaque) ?? d.corDestaque,
    corFundo: parseHex(s.corFundo) ?? d.corFundo,
    corTexto: parseHex(s.corTexto) ?? d.corTexto,
    motivo: pick(s.motivo, MOTIFS, d.motivo),
    destaqueEstilo: pick(s.destaqueEstilo, HIGHLIGHT_STYLES, d.destaqueEstilo),
    raio: pick(s.raio, RADII, d.raio),
    caixaApoio: pick(s.caixaApoio, SUPPORT_BOXES, d.caixaApoio),
    cta: text('cta', d.cta),
    layouts: cleanLayouts(s.layouts),
    layoutsStory: cleanLayouts(s.layoutsStory, false),
    logoPosicaoStory: pick(s.logoPosicaoStory, LOGO_POSITIONS, d.logoPosicaoStory),
    tipografia: text('tipografia', d.tipografia),
    estiloImagem: text('estiloImagem', d.estiloImagem),
    tomDeVoz: text('tomDeVoz', d.tomDeVoz),
    evitar: text('evitar', d.evitar),
    hashtags: text('hashtags', d.hashtags)
  };
}

/** Layouts que valem para o formato: os de story, se a marca tem; senão os do feed. */
export function layoutsFor(brand: Brand, kind: FormatKind): BrandLayout[] {
  return kind === 'story' && brand.layoutsStory.length > 0 ? brand.layoutsStory : brand.layouts;
}

/** Posição da logo para o formato (a do story só vale quando há padrão de story). */
export function logoPositionFor(brand: Brand, kind: FormatKind): LogoPosition {
  return kind === 'story' && brand.layoutsStory.length > 0 ? brand.logoPosicaoStory : brand.logoPosicao;
}

/** Versão sem as logos, para enviar a rotas que não desenham a arte. */
export function withoutLogos(brand: Brand): Brand {
  return { ...brand, logo: '', logoClara: '' };
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = parseHex(hex) ?? '#000000';
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function luminance(hex: string): number {
  const h = parseHex(hex) ?? '#000000';
  const channel = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Luminância relativa (WCAG) acima de 0,5 conta como cor clara. */
export function isLightColor(hex: string): boolean {
  return luminance(hex) > 0.5;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Texto legível sobre a cor dada: branco em fundo escuro, escuro em fundo claro. */
export function inkOn(background: string, dark = '#0F172A'): string {
  return isLightColor(background) ? dark : '#FFFFFF';
}
