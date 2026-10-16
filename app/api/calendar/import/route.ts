import { NextResponse } from 'next/server';
import { normalizeEntries } from '@/lib/calendar';
import { ApiError, currentWorkspaceId, handle, jsonBody } from '@/lib/db';
import { entryToData } from '@/lib/db-mappers';
import { getPrisma } from '@/lib/prisma';

const MAX_ENTRIES = 500;

/** Importa vários dias de uma vez; os que já existem na mesma data são substituídos. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await jsonBody(req);
    if (!Array.isArray(body.entries)) throw new ApiError('Envie a lista em "entries".', 400);
    if (body.entries.length > MAX_ENTRIES) throw new ApiError(`Importe no máximo ${MAX_ENTRIES} dias por vez.`, 400);

    const entries = normalizeEntries(body.entries);
    const workspaceId = await currentWorkspaceId();

    await getPrisma().$transaction(
      entries.map((entry) => {
        const data = entryToData(entry);
        return getPrisma().calendarEntry.upsert({
          where: { workspaceId_date: { workspaceId, date: entry.date } },
          create: { workspaceId, ...data },
          update: data
        });
      })
    );
    return NextResponse.json({ imported: entries.length });
  });
}
