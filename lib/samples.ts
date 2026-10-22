// Amostras de referência: miniaturas dos posts de exemplo e das páginas do manual, guardadas no banco
// para a IA de imagem usar como referência visual. Código compartilhado entre o navegador e o servidor.

export const SAMPLE_KINDS = ['feed', 'story', 'manual'] as const;
export type SampleKind = (typeof SAMPLE_KINDS)[number];

export const SAMPLE_KIND_LABELS: Record<SampleKind, string> = {
  feed: 'posts de feed',
  story: 'stories',
  manual: 'páginas do manual'
};

/** Máximo de amostras guardadas por tipo (feed, story, manual). */
export const MAX_SAMPLES_PER_KIND = 6;

/** Maior lado da miniatura, em pixels. Basta para a IA enxergar composição, fontes e cards. */
export const SAMPLE_MAX_SIDE = 768;

/** Limite de tamanho do JPEG em base64 de uma amostra (a miniatura costuma ter de 50 a 150 mil caracteres). */
export const MAX_SAMPLE_CHARS = 400_000;

/** Quantas referências vão para a IA a cada arte. */
export const REFS_PER_ART = 3;

export interface SampleInput {
  tipo: SampleKind;
  nome: string;
  largura: number;
  altura: number;
  /** JPEG em base64, sem o prefixo "data:". */
  image: string;
}

export type SampleCounts = Record<SampleKind, number>;

export const EMPTY_SAMPLE_COUNTS: SampleCounts = { feed: 0, story: 0, manual: 0 };

/** Modo de criação da arte: pela IA com referências, ou montada por código a partir dos templates. */
export const ART_MODES = ['referencias', 'template'] as const;
export type ArtMode = (typeof ART_MODES)[number];

export function parseArtMode(value: unknown): ArtMode {
  return (ART_MODES as readonly unknown[]).includes(value) ? (value as ArtMode) : 'template';
}
