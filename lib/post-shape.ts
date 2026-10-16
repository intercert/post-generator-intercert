// Formato dos posts nas respostas da API (usado também pelo cliente).
import type { LayoutKind } from './brand';

/** O que a lista e o calendário precisam; sem a imagem e sem os prompts longos. */
export interface PostMeta {
  /** Dia do calendário (YYYY-MM-DD). */
  date: string;
  titulo: string;
  layout: LayoutKind;
  formatId: string;
  legenda: string;
  usedProvider: string;
  imageProvider: string;
  imageWarning: string;
  /** Momento do último salvamento (ms); serve para atualizar a imagem em cache. */
  savedAt: number;
}

/** Tudo o que o gerador mostra ao reabrir um post salvo. */
export interface PostDetail extends PostMeta {
  imagePrompt: string;
  imageJson: string;
  postPrompt: string;
  postJson: string;
  brandJson: string;
}

export const postImageUrl = (post: Pick<PostMeta, 'date' | 'savedAt'>) => `/api/posts/${post.date}/image?v=${post.savedAt}`;
