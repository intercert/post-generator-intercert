// Seleção e conversão das linhas de Post (servidor).
import type { LayoutKind } from '@/lib/brand';
import { LAYOUT_KINDS } from '@/lib/brand';
import type { PostDetail, PostMeta } from '@/lib/post-shape';

export const postMetaSelect = {
  date: true,
  titulo: true,
  layout: true,
  formatId: true,
  legenda: true,
  usedProvider: true,
  imageProvider: true,
  imageWarning: true,
  updatedAt: true
} as const;

export const postDetailSelect = {
  ...postMetaSelect,
  imagePrompt: true,
  imageJson: true,
  postPrompt: true,
  postJson: true,
  brandJson: true
} as const;

type MetaRow = {
  date: string;
  titulo: string;
  layout: string;
  formatId: string;
  legenda: string;
  usedProvider: string;
  imageProvider: string;
  imageWarning: string;
  updatedAt: Date;
};

export function toPostMeta(row: MetaRow): PostMeta {
  return {
    date: row.date,
    titulo: row.titulo,
    layout: (LAYOUT_KINDS as readonly string[]).includes(row.layout) ? (row.layout as LayoutKind) : 'cartao',
    formatId: row.formatId,
    legenda: row.legenda,
    usedProvider: row.usedProvider,
    imageProvider: row.imageProvider,
    imageWarning: row.imageWarning,
    savedAt: row.updatedAt.getTime()
  };
}

export function toPostDetail(
  row: MetaRow & { imagePrompt: string; imageJson: string; postPrompt: string; postJson: string; brandJson: string }
): PostDetail {
  return {
    ...toPostMeta(row),
    imagePrompt: row.imagePrompt,
    imageJson: row.imageJson,
    postPrompt: row.postPrompt,
    postJson: row.postJson,
    brandJson: row.brandJson
  };
}
