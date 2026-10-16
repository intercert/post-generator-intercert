'use client';

import { brandStore, useBrandStatus } from '@/lib/use-brand';
import { calendarStore, useCalendarStatus } from '@/lib/use-calendar';
import { postsStore, usePostsStatus } from '@/lib/post-store';

/** Avisa quando o banco não responde (e nenhuma tela fica "vazia" sem explicação). */
export default function DataBanner() {
  const states = [useBrandStatus(), useCalendarStatus(), usePostsStatus()];
  const error = states.find((s) => s.status === 'error')?.error;
  if (!error) return null;

  function retry() {
    void brandStore.refresh();
    void calendarStore.refresh();
    void postsStore.refresh();
  }

  return (
    <div className="data-banner" role="alert">
      <div>
        <strong>Os dados não carregaram.</strong> <span>{error}</span>
      </div>
      <button type="button" className="btn btn-small btn-quiet" onClick={retry}>
        Tentar de novo
      </button>
    </div>
  );
}
