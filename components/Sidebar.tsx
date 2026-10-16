'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { formatDay } from '@/lib/calendar';
import { useBrand } from '@/lib/use-brand';
import { useCalendar } from '@/lib/use-calendar';
import { useToday } from '@/lib/use-today';

const icon = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const LINKS = [
  { href: '/', label: 'Criar post', icon: icon(<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" />) },
  { href: '/calendario', label: 'Calendário', icon: icon(<><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>) },
  { href: '/marca', label: 'Identidade', icon: icon(<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9L12 3z" />) }
];

export default function Sidebar() {
  const pathname = usePathname();
  const brand = useBrand();
  const today = useToday();
  const entries = useCalendar();

  const next = today ? entries.find((e) => e.date >= today && e.status !== 'postado') : undefined;

  return (
    <aside className="sidebar">
      <Link href="/" className="sidebar-brand" aria-label={`${brand.nome}: gerador de posts`}>
        {brand.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="sidebar-logo-img" src={brand.logo} alt={brand.nome} />
        ) : (
          <>
            <span className="sidebar-mark" aria-hidden="true">
              {brand.nome.trim().charAt(0).toUpperCase()}
            </span>
            <strong>{brand.nome}</strong>
          </>
        )}
      </Link>

      <nav aria-label="Principal">
        <ul className="sidebar-nav">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} aria-current={pathname === link.href ? 'page' : undefined}>
                {link.icon}
                <span>{link.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {next && (
        <Link href={`/?data=${next.date}&auto=1`} className="sidebar-next">
          <small>{next.date === today ? 'Postar hoje' : 'Próximo post'}</small>
          <strong>{next.ocasioes[0] ?? next.objetivo}</strong>
          <span>{formatDay(next.date)}</span>
        </Link>
      )}
    </aside>
  );
}
