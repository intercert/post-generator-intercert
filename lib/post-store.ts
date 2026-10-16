'use client';

import { useEffect, useState } from 'react';
import { apiJson, jsonRequest } from './api-client';
import type { LayoutKind } from './brand';
import { postImageUrl, type PostDetail, type PostMeta } from './post-shape';
import { createRemoteStore, useRemote, type RemoteStatus } from './remote-store';

// Posts gerados, guardados no banco por dia do calendário (rotas /api/posts). A arte final é um PNG
// servido por /api/posts/AAAA-MM-DD/image.

export type PostView = PostMeta & { imageUrl: string };

/** Dados do post a salvar; `image` é o PNG final. */
export interface PostInput {
  date: string;
  titulo: string;
  layout: LayoutKind;
  formatId: string;
  legenda: string;
  usedProvider: string;
  imageProvider: string;
  imageWarning: string;
  imagePrompt: string;
  imageJson: string;
  postPrompt: string;
  postJson: string;
  brandJson: string;
  image: Blob;
}

const EMPTY: Record<string, PostMeta> = {};

export const postsStore = createRemoteStore<Record<string, PostMeta>>(EMPTY, async () => {
  const { posts } = await apiJson<{ posts: PostMeta[] }>('/api/posts', { cache: 'no-store' });
  return Object.fromEntries(posts.map((p) => [p.date, p]));
});

/** Posts salvos por data, com o endereço da imagem. */
export function useSavedPosts(): Record<string, PostView> {
  const { data } = useRemote(postsStore);
  return Object.fromEntries(Object.entries(data).map(([date, p]) => [date, { ...p, imageUrl: postImageUrl(p) }]));
}

export function usePostsStatus(): { status: RemoteStatus; error: string | null } {
  const { status, error } = useRemote(postsStore);
  return { status, error };
}

/** Busca os prompts completos de um post salvo (a lista traz só o resumo). */
export function usePostDetail(date: string | undefined, savedAt: number | undefined): PostDetail | undefined {
  const [loaded, setLoaded] = useState<{ key: string; detail: PostDetail } | null>(null);
  const key = date && savedAt ? `${date}:${savedAt}` : '';

  useEffect(() => {
    if (!date || !key) return;
    const controller = new AbortController();
    apiJson<{ post: PostDetail }>(`/api/posts/${date}`, { cache: 'no-store', signal: controller.signal })
      .then(({ post }) => setLoaded({ key, detail: post }))
      .catch(() => {
        // sem detalhes: a tela mostra só o que a lista traz
      });
    return () => controller.abort();
  }, [date, key]);

  return loaded && loaded.key === key ? loaded.detail : undefined;
}

/** Salva (ou substitui) o post do dia. Devolve a mensagem de erro, ou null se deu certo. */
export async function savePost(input: PostInput): Promise<string | null> {
  const { image, ...fields } = input;
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  form.set('image', image, `post-${input.date}.png`);

  try {
    await apiJson(`/api/posts/${input.date}`, { method: 'PUT', body: form });
    await postsStore.refresh();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Não foi possível salvar o post.';
  }
}

export async function deletePost(date: string): Promise<void> {
  postsStore.set((current) => Object.fromEntries(Object.entries(current).filter(([d]) => d !== date)));
  try {
    await apiJson(`/api/posts/${date}`, jsonRequest('DELETE'));
  } catch {
    await postsStore.refresh();
  }
}

/** Atualiza só a legenda de um post já salvo (a pessoa pode editá-la na tela). */
export async function updatePostCaption(date: string, legenda: string): Promise<void> {
  const current = postsStore.getSnapshot().data[date];
  if (!current || current.legenda === legenda) return;
  postsStore.set((all) => ({ ...all, [date]: { ...all[date], legenda } }));
  try {
    await apiJson(`/api/posts/${date}`, jsonRequest('PATCH', { legenda }));
  } catch {
    await postsStore.refresh();
  }
}
