'use client';

import { useEffect, useState } from 'react';
import {
  localTotal,
  markMigrationHandled,
  migrationDismissed,
  readLocalData,
  sendLocalData,
  type LocalData
} from '@/lib/migrate-local';
import { postsStore } from '@/lib/post-store';
import { useRemote } from '@/lib/remote-store';
import { brandStore } from '@/lib/use-brand';
import { calendarStore } from '@/lib/use-calendar';

/**
 * Se o banco está vazio mas este navegador guarda dados das versões anteriores (identidade, calendário,
 * posts), oferece enviá-los uma vez. Os dados do navegador não são apagados.
 */
export default function LocalDataMigration() {
  const brand = useRemote(brandStore);
  const calendar = useRemote(calendarStore);
  const posts = useRemote(postsStore);

  const [local, setLocal] = useState<LocalData | null>(null);
  const [phase, setPhase] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const ready = [brand, calendar, posts].every((s) => s.status === 'ready');
  const databaseEmpty = brand.data === null && calendar.data.length === 0 && Object.keys(posts.data).length === 0;

  useEffect(() => {
    if (!ready || !databaseEmpty || migrationDismissed()) return;
    let cancelled = false;
    readLocalData().then((data) => {
      if (!cancelled) setLocal(data);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, databaseEmpty]);

  async function send() {
    if (!local) return;
    setPhase('working');
    const failure = await sendLocalData(local);
    if (failure) {
      setPhase('error');
      setMessage(failure);
      return;
    }
    markMigrationHandled();
    setPhase('done');
    setMessage('Pronto: identidade, calendário e posts deste navegador agora estão no banco.');
  }

  function dismiss() {
    markMigrationHandled();
    setLocal(null);
  }

  if (phase === 'done') {
    return (
      <p className="notice-ok migration-done" role="status">
        {message}
      </p>
    );
  }

  if (!local || localTotal(local) === 0 || !databaseEmpty) return null;

  const parts = [
    local.brand ? 'a identidade visual' : '',
    local.entries.length ? `${local.entries.length} ${local.entries.length === 1 ? 'dia' : 'dias'} do calendário` : '',
    local.posts.length ? `${local.posts.length} ${local.posts.length === 1 ? 'post gerado' : 'posts gerados'}` : ''
  ].filter(Boolean);

  return (
    <div className="migration-banner" role="region" aria-label="Dados antigos deste navegador">
      <p>
        <strong>Encontrei dados salvos só neste navegador:</strong> {parts.join(', ')}. Enviar para o banco para a equipe
        toda usar? Os dados daqui não são apagados.
        {phase === 'error' && <span className="text-danger"> Não deu certo: {message}</span>}
      </p>
      <div className="actions">
        <button type="button" className="btn btn-primary btn-small" onClick={send} disabled={phase === 'working'}>
          {phase === 'working' ? 'Enviando…' : 'Enviar para o banco'}
        </button>
        <button type="button" className="btn btn-quiet btn-small" onClick={dismiss} disabled={phase === 'working'}>
          Agora não
        </button>
      </div>
    </div>
  );
}
