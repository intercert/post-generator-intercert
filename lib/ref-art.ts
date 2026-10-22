// Arte completa feita pela IA de imagem do Gemini a partir de posts de exemplo da própria marca.
// Só use no servidor. Aqui ficam: a escolha rotativa das referências, a chamada ao modelo de imagem com
// as imagens de entrada e a conferência do texto escrito na arte.
import type { SampleKind } from '@/lib/samples';
import { REFS_PER_ART } from '@/lib/samples';
import { currentWorkspaceId } from '@/lib/db';
import { extractJsonObject, gemini, tryModels } from '@/lib/ai-clients';
import { getPrisma } from '@/lib/prisma';

/** Erro com mensagem pronta para a pessoa (em português), usado para cair para o modo por template. */
export class RefArtError extends Error {}

export interface RefImage {
  /** Texto que apresenta a imagem à IA, logo antes dela. */
  label: string;
  mimeType: string;
  /** Base64, sem o prefixo "data:". */
  data: string;
}

export interface References {
  /** Posts de exemplo escolhidos para esta arte. */
  refs: RefImage[];
  /** Logo oficial (versão para fundo claro e, se houver, para fundo escuro). */
  logos: RefImage[];
  /** Os posts de exemplo não eram do tipo pedido (ex.: sem stories) e vieram do outro tipo. */
  otherKind: boolean;
}

// Modelos de imagem do Gemini (usam generateContent, não o Imagen)
export const GEMINI_IMAGE_MODELS = ['gemini-nano-banana-2.1', 'gemini-3.1-flash-image'];

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function splitDataUrl(url: string): { mimeType: string; data: string } | null {
  const m = /^data:([\w/+.-]+);base64,([\s\S]+)$/.exec(url);
  return m ? { mimeType: m[1], data: m[2] } : null;
}

/**
 * Escolhe de 2 a 3 posts de exemplo do tipo pedido em rodízio: entram primeiro os que ficaram mais tempo sem
 * serem usados (e os nunca usados), sorteados entre os empatados. Assim cada arte vê referências diferentes.
 * Devolve null se a empresa não tem nenhum post de exemplo guardado.
 */
export async function pickReferences(kind: SampleKind): Promise<References | null> {
  const prisma = getPrisma();
  const workspaceId = await currentWorkspaceId();

  const metaOf = (tipo: SampleKind) =>
    prisma.brandSample.findMany({ where: { workspaceId, tipo }, select: { id: true, nome: true, usadoEm: true } });

  let meta = await metaOf(kind);
  let otherKind = false;
  if (meta.length === 0) {
    // Sem stories analisados, os posts do feed servem de referência de estilo (o enquadramento vai no prompt)
    meta = await metaOf(kind === 'story' ? 'feed' : 'story');
    otherKind = meta.length > 0;
  }
  if (meta.length === 0) return null;

  const chosen = shuffle(meta)
    .sort((a, b) => (a.usadoEm?.getTime() ?? 0) - (b.usadoEm?.getTime() ?? 0))
    .slice(0, Math.min(REFS_PER_ART, Math.max(2, meta.length)));
  const ids = chosen.map((c) => c.id);

  const rows = await prisma.brandSample.findMany({ where: { id: { in: ids } }, select: { id: true, image: true } });
  const imageById = new Map(rows.map((r) => [r.id, r.image]));
  await prisma.brandSample.updateMany({ where: { id: { in: ids } }, data: { usadoEm: new Date() } });

  const refs = chosen.flatMap((c, i): RefImage[] => {
    const data = imageById.get(c.id);
    return data ? [{ label: `Referência ${i + 1} (post real já publicado pela marca)`, mimeType: 'image/jpeg', data }] : [];
  });
  if (refs.length === 0) return null;

  const brand = await prisma.brand.findUnique({ where: { workspaceId }, select: { logo: true, logoClara: true } });
  const logos: RefImage[] = [];
  const light = brand?.logo ? splitDataUrl(brand.logo) : null;
  const dark = brand?.logoClara ? splitDataUrl(brand.logoClara) : null;
  if (light) logos.push({ label: 'LOGO OFICIAL (versão para fundo claro)', ...light });
  if (dark) logos.push({ label: 'LOGO OFICIAL (versão para fundo escuro)', ...dark });

  return { refs, logos, otherKind };
}

/** Pede ao Gemini a arte completa, enviando as referências e a logo como imagens de entrada. */
export async function generateArtWithReferences(opts: {
  prompt: string;
  refs: References;
  aspectRatio: string;
}): Promise<{ dataUrl: string; model: string }> {
  if (!gemini) throw new RefArtError('A arte com referências usa o Gemini, e a chave GEMINI_API_KEY não está configurada.');
  const client = gemini;

  const parts = [
    ...[...opts.refs.refs, ...opts.refs.logos].flatMap((img) => [
      { text: `${img.label}:` },
      { inlineData: { mimeType: img.mimeType, data: img.data } }
    ]),
    { text: opts.prompt }
  ];

  let usedModel = '';
  const res = await tryModels(GEMINI_IMAGE_MODELS, async (model) => {
    usedModel = model;
    return client.models.generateContent({
      model,
      contents: [{ role: 'user', parts }],
      config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: opts.aspectRatio } }
    });
  });

  const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new RefArtError('O Gemini não devolveu uma imagem para a arte com referências.');
  return { dataUrl: `data:${part.inlineData.mimeType ?? 'image/png'};base64,${part.inlineData.data}`, model: usedModel };
}

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const wordsOf = (text: string): string[] => normalize(text).split(' ').filter(Boolean);

export interface TextCheck {
  ok: boolean;
  /** O que está errado, em português, quando ok é false. */
  problem: string;
}

/**
 * Compara o texto lido na arte com o que devia estar escrito. Palavras que faltam ou estão grafadas diferente
 * (inclusive sem acento) e texto a mais reprovam a arte. `allowed` são textos que podem aparecer além dos pedidos
 * (nome da marca, site, rótulo).
 */
export function compareArtText(read: string[], expected: { titulo: string[]; outros: string[] }, allowed: string[]): TextCheck {
  const found = new Set(read.flatMap(wordsOf));
  const missingIn = (texts: string[]) => texts.flatMap(wordsOf).filter((w) => !found.has(w));

  const missingTitle = missingIn(expected.titulo);
  if (missingTitle.length > 0) {
    return { ok: false, problem: `o título saiu diferente do pedido, com palavras faltando ou erradas (${[...new Set(missingTitle)].join(', ')})` };
  }

  const missingOther = missingIn(expected.outros);
  const otherTotal = expected.outros.flatMap(wordsOf).length;
  if (otherTotal > 0 && missingOther.length / otherTotal > 0.1) {
    return { ok: false, problem: `parte dos textos saiu errada (faltou ou veio errado: ${[...new Set(missingOther)].join(', ')})` };
  }

  const known = new Set([...expected.titulo, ...expected.outros, ...allowed].flatMap(wordsOf));
  const extra = [...new Set(read.flatMap(wordsOf))].filter((w) => w.length >= 3 && !known.has(w));
  if (extra.length > 3) {
    return { ok: false, problem: `a arte tem texto que não foi pedido (${extra.slice(0, 6).join(', ')})` };
  }
  return { ok: true, problem: '' };
}

const READ_PROMPT = `Você é um leitor de texto em imagens (OCR). Transcreva TODOS os textos legíveis da imagem, exatamente como estão escritos, letra por letra, incluindo acentos. NÃO corrija erros de ortografia, NÃO complete palavras cortadas e NÃO traduza. Ignore texto que faça parte da logo. Retorne EXCLUSIVAMENTE um JSON: {"textos": ["cada bloco de texto, em uma string"]}`;

/** Lê o texto escrito na arte com um modelo de visão do Gemini. Lança erro se não conseguir ler. */
export async function readArtText(dataUrl: string): Promise<string[]> {
  if (!gemini) throw new Error('Gemini não configurado.');
  const client = gemini;
  const image = splitDataUrl(dataUrl);
  if (!image) throw new Error('Imagem inválida.');

  const res = await tryModels(['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'], (model) =>
    client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ inlineData: image }, { text: 'Transcreva os textos desta imagem.' }] }],
      config: { systemInstruction: READ_PROMPT, responseMimeType: 'application/json' }
    })
  );
  const record = extractJsonObject(res.text ?? '');
  if (!Array.isArray(record.textos)) throw new Error('Leitura sem lista de textos.');
  return record.textos.filter((t): t is string => typeof t === 'string');
}
