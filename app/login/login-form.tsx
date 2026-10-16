'use client';

import { SpaceLogin } from '@/components/ui/space-login';

// Só aceita caminhos internos, para o ?next= não virar redirecionamento aberto.
function destination() {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export default function LoginForm() {
  async function handleSubmit({ email, password }: { email: string; password: string }) {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || 'Não foi possível entrar.');
    }
    // Navegação completa para recarregar layout e dados já autenticados.
    window.location.assign(destination());
  }

  return <SpaceLogin onSubmit={handleSubmit} />;
}
