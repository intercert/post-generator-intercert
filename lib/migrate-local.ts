'use client';

// Migração única: leva para o banco o que as versões anteriores guardavam só neste navegador
// (identidade e calendário no localStorage, posts gerados no IndexedDB). Não apaga nada daqui.

import { LAYOUT_KINDS, normalizeBrand, type Brand, type LayoutKind } from './brand';
import { normalizeEntries, type CalendarEntry } from './calendar';
import { savePost } from './post-store';
import { saveBrand } from './use-brand';
import { importEntries } from './use-calendar';

const OLD_BRAND_KEY = 'post-generator:brand:v2';
const OLD_CALENDAR_KEY = 'post-generator:calendar:v1';
const DONE_KEY = 'post-generator:migrated:v1';
const OLD_DB = 'post-generator';

interface OldPost {
  date: string;
  titulo: string;
  layout: string;
  formatId: string;
  legenda: string;
  usedProvider: string;
  imageProvider: string;
  imageWarning: string;
  imagePrompt: string;
  imageJson: string;
  postPrompt?: string;
  postJson?: string;
  brandJson: string;
  image: Blob;
}

export interface LocalData {
  brand: Brand | null;
  entries: CalendarEntry[];
  posts: OldPost[];
}

export function migrationDismissed(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) !== null;
  } catch {
    return true;
  }
}

export function markMigrationHandled() {
  try {
    localStorage.setItem(DONE_KEY, String(Date.now()));
  } catch {
    // sem armazenamento: o aviso pode voltar, sem prejuízo
  }
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function readOldPosts(): Promise<OldPost[]> {
  if (typeof indexedDB === 'undefined') return [];
  // Evita criar um banco vazio só para olhar: confere se ele existe antes de abrir
  if (typeof indexedDB.databases === 'function') {
    const all = await indexedDB.databases();
    if (!all.some((d) => d.name === OLD_DB)) return [];
  }
  return new Promise<OldPost[]>((resolve) => {
    const open = indexedDB.open(OLD_DB);
    open.onerror = () => resolve([]);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('posts')) {
        db.close();
        resolve([]);
        return;
      }
      const req = db.transaction('posts').objectStore('posts').getAll();
      req.onsuccess = () => {
        db.close();
        resolve((req.result as OldPost[]).filter((p) => p && p.image instanceof Blob));
      };
      req.onerror = () => {
        db.close();
        resolve([]);
      };
    };
  });
}

/** O que existe guardado só neste navegador. */
export async function readLocalData(): Promise<LocalData> {
  const rawBrand = readJson(OLD_BRAND_KEY);
  return {
    brand: rawBrand ? normalizeBrand(rawBrand) : null,
    entries: normalizeEntries(readJson(OLD_CALENDAR_KEY)),
    posts: await readOldPosts()
  };
}

export const localTotal = (d: LocalData) => (d.brand ? 1 : 0) + d.entries.length + d.posts.length;

/** Envia tudo ao banco. Devolve a mensagem de erro, ou null se deu certo. */
export async function sendLocalData(data: LocalData): Promise<string | null> {
  if (data.brand) {
    const error = await saveBrand(data.brand);
    if (error) return `Identidade: ${error}`;
  }
  if (data.entries.length > 0) {
    const error = await importEntries(data.entries);
    if (error) return `Calendário: ${error}`;
  }
  for (const post of data.posts) {
    const layout: LayoutKind = (LAYOUT_KINDS as readonly string[]).includes(post.layout) ? (post.layout as LayoutKind) : 'cartao';
    const error = await savePost({
      date: post.date,
      slot: 1,
      titulo: post.titulo ?? '',
      layout,
      formatId: post.formatId,
      legenda: post.legenda ?? '',
      usedProvider: post.usedProvider ?? '',
      imageProvider: post.imageProvider ?? '',
      imageWarning: post.imageWarning ?? '',
      imagePrompt: post.imagePrompt ?? '',
      imageJson: post.imageJson ?? '',
      postPrompt: post.postPrompt ?? '',
      postJson: post.postJson ?? '',
      brandJson: post.brandJson ?? '',
      image: post.image
    });
    if (error) return `Post de ${post.date}: ${error}`;
  }
  return null;
}
