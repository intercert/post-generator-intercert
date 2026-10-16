import { NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_MAX_AGE, checkCredentials, createSessionToken } from '@/lib/auth';

export async function POST(req: Request) {
  if (!process.env.LOGIN_EMAIL || !process.env.LOGIN_PASSWORD) {
    return NextResponse.json({ error: 'Login não configurado: defina LOGIN_EMAIL e LOGIN_PASSWORD no .env.' }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  if (!(await checkCredentials(body?.email, body?.password))) {
    return NextResponse.json({ error: 'Email ou senha incorretos.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    // Só marca Secure em HTTPS; em HTTP puro (rede local) o navegador descartaria o cookie.
    secure: (req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '')) === 'https',
    path: '/',
    maxAge: SESSION_MAX_AGE
  });
  return res;
}

// Logout
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
