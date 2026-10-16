// Acesso ao banco para as rotas: a empresa atual e o tratamento padrão de erros.
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

const DEFAULT_SLUG = 'default';
const DEFAULT_NAME = 'Minha empresa';

let cachedWorkspaceId: string | null = null;

/**
 * Empresa atual. Sem login há uma só ("default"), criada na primeira chamada. Quando houver login,
 * é aqui que o workspace passa a vir da sessão da pessoa.
 */
export async function currentWorkspaceId(): Promise<string> {
  if (cachedWorkspaceId) return cachedWorkspaceId;
  const prisma = getPrisma();
  const workspace = await prisma.workspace.upsert({
    where: { slug: DEFAULT_SLUG },
    update: {},
    create: { slug: DEFAULT_SLUG, name: DEFAULT_NAME },
    select: { id: true }
  });
  cachedWorkspaceId = workspace.id;
  return workspace.id;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

/** Executa a rota e converte erros em respostas JSON claras (banco fora do ar, dado inválido...). */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Erro na API:', error);
    const code = (error as { code?: unknown }).code;
    const message = String((error as { message?: unknown }).message ?? '');
    const unreachable =
      message.includes('Configuração do banco incompleta') ||
      message.includes('DB_PORT inválida') ||
      /timeout/i.test(message) ||
      message.includes('ECONNREFUSED') ||
      code === 'ER_ACCESS_DENIED_ERROR' ||
      code === 'ER_BAD_DB_ERROR' ||
      code === 'ECONNREFUSED' ||
      /pool timeout|Connection (refused|timeout)|getaddrinfo/i.test(message);
    if (unreachable) {
      return NextResponse.json(
        {
          error:
            'Não foi possível acessar o banco de dados. Confira se o MySQL está ligado, se você está na mesma rede dele e se as variáveis DB_HOST, DB_USERNAME, DB_PASSWORD e DB_DATABASE do .env.local estão certas.'
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'Erro interno no servidor.' }, { status: 500 });
  }
}

export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json();
    if (typeof body === 'object' && body !== null && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // cai no erro abaixo
  }
  throw new ApiError('Corpo da requisição inválido. Envie um JSON.', 400);
}
