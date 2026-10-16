// Clientes das IAs e utilitários compartilhados pelas rotas do servidor.
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';

export type ProviderId = 'openai' | 'gemini' | 'claude';
export const PROVIDER_IDS: ProviderId[] = ['openai', 'gemini', 'claude'];

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
export const gemini = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
export const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

export const IS_CONFIGURED: Record<ProviderId, boolean> = {
  openai: !!openai,
  gemini: !!gemini,
  claude: !!anthropic
};

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: 'OpenAI (GPT-4o)',
  gemini: 'Google Gemini',
  claude: 'Anthropic Claude'
};

/** Provedor escolhido primeiro, depois os demais como fallback; só os que têm chave. */
export function providerOrder(chosen: ProviderId): ProviderId[] {
  const configured = PROVIDER_IDS.filter((p) => IS_CONFIGURED[p]);
  if (configured.length === 0) {
    throw new HttpError('Nenhum modelo de IA configurado. Adicione ao menos uma chave de API no .env.local.', 503);
  }
  return [chosen, ...PROVIDER_IDS.filter((p) => p !== chosen)].filter((p) => IS_CONFIGURED[p]);
}

export function parseProvider(value: unknown, fallback: ProviderId): ProviderId {
  const provider = value ?? fallback;
  if (typeof provider !== 'string' || !PROVIDER_IDS.includes(provider as ProviderId)) {
    throw new HttpError('Modelo de IA inválido.', 400);
  }
  return provider as ProviderId;
}

// Erros temporários (sobrecarga/limite de taxa) merecem novas tentativas antes de cair para outro provedor.
const TRANSIENT_STATUS = [429, 500, 502, 503, 504, 529];
const MAX_ATTEMPTS = 3;

export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: unknown }).status;
      const transient = typeof status === 'number' && TRANSIENT_STATUS.includes(status);
      if (!transient || attempt >= MAX_ATTEMPTS) throw err;
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
  }
}

/** Tenta cada modelo em ordem (com novas tentativas em erros temporários) até um responder. */
export async function tryModels<T>(models: string[], run: (model: string) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (const model of models) {
    try {
      return await withRetry(() => run(model));
    } catch (err) {
      console.warn(`Modelo ${model} falhou, tentando o próximo...`, err);
      lastError = err;
    }
  }
  throw lastError;
}

/** Extrai o primeiro objeto JSON do texto de uma IA (tolera blocos markdown e conversa em volta). */
export function extractJsonObject(raw: string): Record<string, unknown> {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Resposta sem JSON.');
  const data: unknown = JSON.parse(raw.slice(start, end + 1));
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('JSON não é um objeto.');
  return data as Record<string, unknown>;
}

export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json();
    if (typeof body === 'object' && body !== null) return body as Record<string, unknown>;
  } catch {
    // cai no erro abaixo
  }
  throw new HttpError('Corpo da requisição inválido. Envie um JSON.', 400);
}
