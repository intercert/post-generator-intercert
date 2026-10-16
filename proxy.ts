import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const logged = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === '/api/login') return NextResponse.next();

  if (pathname === '/login') {
    return logged ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  }

  if (logged) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const login = new URL('/login', request.url);
  if (pathname !== '/') login.searchParams.set('next', pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Tudo, exceto arquivos estáticos do Next e da pasta public.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|js|mjs|css|map)$).*)']
};
