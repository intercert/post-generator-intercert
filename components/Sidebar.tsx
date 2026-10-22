'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { MONTH_NAMES, needsWork, parseISO } from '@/lib/calendar';
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

async function logout() {
  await fetch('/api/login', { method: 'DELETE' }).catch(() => undefined);
  // Recarga completa para limpar os dados em memória da sessão anterior.
  window.location.href = '/login';
}

export default function Sidebar() {
  const pathname = usePathname();
  const brand = useBrand();
  const today = useToday();
  const entries = useCalendar();

  const next = today ? entries.find((e) => e.date >= today && needsWork(e.status)) : undefined;

  // Resumo do mês e pendências para o selo do Calendário
  const month = today ? entries.filter((e) => e.date.startsWith(today.slice(0, 7))) : [];
  const posted = month.filter((e) => e.status === 'postado').length;
  const scheduled = month.filter((e) => e.status === 'agendado').length;
  const due = today ? entries.filter((e) => e.date <= today && needsWork(e.status)).length : 0;
  const monthName = (() => {
    const p = parseISO(today);
    return p ? MONTH_NAMES[p.month].charAt(0).toUpperCase() + MONTH_NAMES[p.month].slice(1) : '';
  })();
  const nextDate = parseISO(next?.date);

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
                {link.href === '/calendario' && due > 0 && (
                  <b className="nav-count" aria-label={`${due} ${due === 1 ? 'post pendente' : 'posts pendentes'} até hoje`}>
                    {due}
                  </b>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar-foot">
        {month.length > 0 && (
          <div className="sidebar-month">
            <div className="sidebar-month-head">
              <strong>{monthName}</strong>
              <span>
                {posted} de {month.length} {month.length === 1 ? 'postado' : 'postados'}
              </span>
            </div>
            <div
              className="sidebar-bar"
              role="img"
              aria-label={`${posted} postados e ${scheduled} agendados, de ${month.length} posts em ${monthName.toLowerCase()}`}
            >
              <i data-kind="postado" style={{ width: `${(posted / month.length) * 100}%` }} />
              <i data-kind="agendado" style={{ width: `${(scheduled / month.length) * 100}%` }} />
            </div>
          </div>
        )}
        {next && nextDate && (
          <Link href={`/?data=${next.date}&pos=${next.slot}&auto=1`} className="sidebar-next">
            <span className="sidebar-next-date" aria-hidden="true">
              <b>{nextDate.day}</b>
              <i>{MONTH_NAMES[nextDate.month].slice(0, 3)}</i>
            </span>
            <span className="sidebar-next-body">
              <small>{next.date === today ? 'Postar hoje' : 'Próximo post'}</small>
              <strong>{next.ocasioes[0] ?? next.objetivo}</strong>
            </span>
          </Link>
        )}
        <button type="button" className="sidebar-logout" onClick={logout}>
          {icon(<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 8l4 4-4 4M20 12H9" />)}
          <span>Sair</span>
        </button>
      </div>
    </aside>
  );
}
