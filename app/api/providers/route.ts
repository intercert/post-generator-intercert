import { NextResponse, connection } from 'next/server';
import { IS_CONFIGURED } from '@/lib/ai-clients';

// Diz à tela quais IAs têm chave configurada (nunca expõe as chaves).
// connection() marca a rota como dinâmica: sem isso o Next a pré-renderiza no build e congela as chaves daquele momento.
export async function GET() {
  await connection();
  return NextResponse.json(IS_CONFIGURED);
}
