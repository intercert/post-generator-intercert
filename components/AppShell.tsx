'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import Sidebar from '@/components/Sidebar';
import DataBanner from '@/components/DataBanner';
import LocalDataMigration from '@/components/LocalDataMigration';

// A tela de login ocupa a página inteira, sem menu lateral nem chamadas à API.
export default function AppShell({ children }: { children: ReactNode }) {
  if (usePathname() === '/login') return <>{children}</>;

  return (
    <div className="app">
      <Sidebar />
      <div className="app-main">
        <DataBanner />
        <LocalDataMigration />
        {children}
      </div>
    </div>
  );
}
