// Chamadas às rotas /api do próprio app, com mensagens de erro em português.

export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (init?.signal?.aborted) throw err;
    throw new Error('Não foi possível falar com o servidor. Verifique a conexão e tente de novo.');
  }
  if (!res.ok) {
    let message = 'O servidor não conseguiu concluir o pedido.';
    try {
      const data: unknown = await res.json();
      if (typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string') {
        message = data.error;
      }
    } catch {
      // resposta sem JSON
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const jsonRequest = (method: 'PUT' | 'POST' | 'PATCH' | 'DELETE', body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body)
});
