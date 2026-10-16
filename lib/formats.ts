// Catálogo de redes e formatos. Importado pelo cliente (tela) e pelo servidor (rotas).
// O cliente envia só o id do formato; o servidor valida e busca as dimensões aqui.

export type NetworkId = 'instagram' | 'facebook' | 'whatsapp' | 'linkedin' | 'outro';
export type Orientation = 'square' | 'portrait' | 'landscape';
export type DalleSize = '1024x1024' | '1024x1792' | '1792x1024';
export type ImagenRatio = '1:1' | '3:4' | '9:16' | '16:9';

export interface PostFormat {
  id: string;
  network: NetworkId;
  label: string;
  width: number;
  height: number;
  orientation: Orientation;
  dalleSize: DalleSize;
  imagenRatio: ImagenRatio;
  /** Faixas (em px do formato) cobertas pela interface do app. */
  safeTop: number;
  safeBottom: number;
  /** Trecho em inglês para o prompt da imagem de fundo. */
  imageHint: string;
  /** Instrução, em português, sobre a legenda desta rede/formato. */
  captionGuide: string;
  /** Story e Status não têm legenda: a IA gera só um texto de apoio. */
  hasCaption: boolean;
  captionLimit?: number;
}

export interface Network {
  id: NetworkId;
  label: string;
  formats: PostFormat[];
}

interface FormatInput {
  id: string;
  network: NetworkId;
  label: string;
  width: number;
  height: number;
  ratio: ImagenRatio;
  safeTop?: number;
  safeBottom?: number;
  imageHint: string;
  captionGuide: string;
  hasCaption?: boolean;
  captionLimit?: number;
}

const DALLE_BY_RATIO: Record<ImagenRatio, DalleSize> = {
  '1:1': '1024x1024',
  '3:4': '1024x1792',
  '9:16': '1024x1792',
  '16:9': '1792x1024'
};

function orientationOf(width: number, height: number): Orientation {
  if (width === height) return 'square';
  return height > width ? 'portrait' : 'landscape';
}

function format({ ratio, safeTop = 0, safeBottom = 0, hasCaption = true, ...rest }: FormatInput): PostFormat {
  return {
    ...rest,
    orientation: orientationOf(rest.width, rest.height),
    dalleSize: DALLE_BY_RATIO[ratio],
    imagenRatio: ratio,
    safeTop,
    safeBottom,
    hasCaption
  };
}

const HINT_SQUARE = 'square 1:1 composition, balanced framing, clean empty area in the upper third';
const HINT_PORTRAIT = 'vertical 4:5 portrait composition, subject in the lower half, clean empty area in the upper third';
const HINT_STORY =
  'tall vertical 9:16 composition, subject centered in the middle third, leave the top 15% and bottom 20% calm and empty because app interface covers them';
const HINT_LANDSCAPE = 'wide horizontal composition, subject on the right side, large clean empty area on the left for text';

const CAPTION_NONE =
  'Este formato não tem legenda. Escreva um texto de apoio curto (1 a 2 frases, até 140 caracteres), sem hashtags e sem excesso de emojis.';

const CAPTION_INSTAGRAM =
  'Legenda de Instagram: gancho forte na primeira linha, 3 a 5 linhas curtas, tom profissional e próximo, um convite à ação e 3 a 5 hashtags no final. Máximo de 2.200 caracteres.';
const CAPTION_FACEBOOK =
  'Legenda de Facebook: conversacional e acolhedora, 2 a 4 parágrafos curtos, uma pergunta ou convite para comentar e no máximo 2 hashtags.';
const CAPTION_LINKEDIN =
  'Post de LinkedIn: tom corporativo e humano, primeira linha que prende (aparece antes do "ver mais"), parágrafos de 1 a 2 linhas, um posicionamento da empresa e 3 hashtags no final. Máximo de 3.000 caracteres.';
const CAPTION_GENERIC =
  'Legenda genérica para redes sociais: tom profissional, 2 a 4 linhas curtas, um convite à ação e 3 hashtags no final.';

export const NETWORKS: Network[] = [
  {
    id: 'instagram',
    label: 'Instagram',
    formats: [
      format({
        id: 'instagram-feed-quadrado',
        network: 'instagram',
        label: 'Feed quadrado',
        width: 1080,
        height: 1080,
        ratio: '1:1',
        imageHint: HINT_SQUARE,
        captionGuide: CAPTION_INSTAGRAM,
        captionLimit: 2200
      }),
      format({
        id: 'instagram-feed-retrato',
        network: 'instagram',
        label: 'Feed retrato',
        width: 1080,
        height: 1350,
        ratio: '3:4',
        imageHint: HINT_PORTRAIT,
        captionGuide: CAPTION_INSTAGRAM,
        captionLimit: 2200
      }),
      format({
        id: 'instagram-story',
        network: 'instagram',
        label: 'Story',
        width: 1080,
        height: 1920,
        ratio: '9:16',
        safeTop: 250,
        safeBottom: 340,
        imageHint: HINT_STORY,
        captionGuide: CAPTION_NONE,
        hasCaption: false
      })
    ]
  },
  {
    id: 'facebook',
    label: 'Facebook',
    formats: [
      format({
        id: 'facebook-feed-quadrado',
        network: 'facebook',
        label: 'Feed quadrado',
        width: 1080,
        height: 1080,
        ratio: '1:1',
        imageHint: HINT_SQUARE,
        captionGuide: CAPTION_FACEBOOK
      }),
      format({
        id: 'facebook-feed-retrato',
        network: 'facebook',
        label: 'Feed retrato',
        width: 1080,
        height: 1350,
        ratio: '3:4',
        imageHint: HINT_PORTRAIT,
        captionGuide: CAPTION_FACEBOOK
      }),
      format({
        id: 'facebook-story',
        network: 'facebook',
        label: 'Story',
        width: 1080,
        height: 1920,
        ratio: '9:16',
        safeTop: 250,
        safeBottom: 340,
        imageHint: HINT_STORY,
        captionGuide: CAPTION_NONE,
        hasCaption: false
      }),
      format({
        id: 'facebook-horizontal',
        network: 'facebook',
        label: 'Horizontal',
        width: 1200,
        height: 630,
        ratio: '16:9',
        imageHint: HINT_LANDSCAPE,
        captionGuide: CAPTION_FACEBOOK
      })
    ]
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    formats: [
      format({
        id: 'whatsapp-status',
        network: 'whatsapp',
        label: 'Status',
        width: 1080,
        height: 1920,
        ratio: '9:16',
        safeTop: 200,
        safeBottom: 280,
        imageHint: HINT_STORY,
        captionGuide: CAPTION_NONE,
        hasCaption: false
      }),
      format({
        id: 'whatsapp-mensagem',
        network: 'whatsapp',
        label: 'Mensagem ou grupo',
        width: 1080,
        height: 1080,
        ratio: '1:1',
        imageHint: HINT_SQUARE,
        captionGuide:
          'Mensagem de WhatsApp: direta e pessoal, 2 a 3 frases curtas, no máximo 2 emojis, sem hashtags, pronta para colar junto da imagem.'
      })
    ]
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    formats: [
      format({
        id: 'linkedin-feed-quadrado',
        network: 'linkedin',
        label: 'Feed quadrado',
        width: 1080,
        height: 1080,
        ratio: '1:1',
        imageHint: HINT_SQUARE,
        captionGuide: CAPTION_LINKEDIN,
        captionLimit: 3000
      }),
      format({
        id: 'linkedin-feed-retrato',
        network: 'linkedin',
        label: 'Feed retrato',
        width: 1080,
        height: 1350,
        ratio: '3:4',
        imageHint: HINT_PORTRAIT,
        captionGuide: CAPTION_LINKEDIN,
        captionLimit: 3000
      }),
      format({
        id: 'linkedin-horizontal',
        network: 'linkedin',
        label: 'Horizontal',
        width: 1200,
        height: 627,
        ratio: '16:9',
        imageHint: HINT_LANDSCAPE,
        captionGuide: CAPTION_LINKEDIN,
        captionLimit: 3000
      })
    ]
  },
  {
    id: 'outro',
    label: 'Outro',
    formats: [
      format({
        id: 'outro-quadrado',
        network: 'outro',
        label: 'Quadrado',
        width: 1080,
        height: 1080,
        ratio: '1:1',
        imageHint: HINT_SQUARE,
        captionGuide: CAPTION_GENERIC
      }),
      format({
        id: 'outro-retrato',
        network: 'outro',
        label: 'Retrato',
        width: 1080,
        height: 1350,
        ratio: '3:4',
        imageHint: HINT_PORTRAIT,
        captionGuide: CAPTION_GENERIC
      }),
      format({
        id: 'outro-vertical',
        network: 'outro',
        label: 'Vertical',
        width: 1080,
        height: 1920,
        ratio: '9:16',
        imageHint: HINT_STORY,
        captionGuide: CAPTION_GENERIC
      }),
      format({
        id: 'outro-horizontal',
        network: 'outro',
        label: 'Horizontal',
        width: 1920,
        height: 1080,
        ratio: '16:9',
        imageHint: HINT_LANDSCAPE,
        captionGuide: CAPTION_GENERIC
      })
    ]
  }
];

export const FORMATS: PostFormat[] = NETWORKS.flatMap((n) => n.formats);

const FORMATS_BY_ID = new Map(FORMATS.map((f) => [f.id, f]));

export const DEFAULT_NETWORK: NetworkId = 'instagram';
export const DEFAULT_FORMAT_ID = 'instagram-feed-quadrado';

/** Devolve o formato do id informado, ou undefined se o id não existir. */
export function getFormat(id: unknown): PostFormat | undefined {
  return typeof id === 'string' ? FORMATS_BY_ID.get(id) : undefined;
}

export function getNetwork(id: NetworkId): Network {
  return NETWORKS.find((n) => n.id === id) ?? NETWORKS[0];
}

export const NETWORK_LABELS: Record<NetworkId, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  linkedin: 'LinkedIn',
  outro: 'Outro'
};

export const ORIENTATION_LABELS: Record<Orientation, string> = {
  square: 'quadrada',
  portrait: 'vertical',
  landscape: 'horizontal'
};
