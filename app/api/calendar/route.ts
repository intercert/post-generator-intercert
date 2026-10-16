import { NextResponse, connection } from 'next/server';
import { normalizeEntry } from '@/lib/calendar';
import { ApiError, currentWorkspaceId, handle, jsonBody } from '@/lib/db';
import { entryFromRow, entryToData } from '@/lib/db-mappers';
import { getPrisma } from '@/lib/prisma';

// Calendário: um dia planejado por data.

export async function GET() {
  await connection();
  return handle(async () => {
    const workspaceId = await currentWorkspaceId();
    const rows = await getPrisma().calendarEntry.findMany({ where: { workspaceId }, orderBy: { date: 'asc' } });
    const entries = rows.map(entryFromRow).filter((e) => e !== null);
    return NextResponse.json({ entries });
  });
}

/** Cria ou atualiza um dia. Se a data mudou, `previousDate` diz qual dia antigo sai do lugar. */
export async function PUT(req: Request) {
  return handle(async () => {
    const body = await jsonBody(req);
    const entry = normalizeEntry(body.entry);
    if (!entry) throw new ApiError('Dia inválido. Confira a data (AAAA-MM-DD).', 400);
    const previousDate = typeof body.previousDate === 'string' ? body.previousDate : undefined;

    const workspaceId = await currentWorkspaceId();
    const prisma = getPrisma();
    const data = entryToData(entry);

    await prisma.$transaction(async (tx) => {
      if (previousDate && previousDate !== entry.date) {
        // O post gerado acompanha o dia que mudou de data
        await tx.post.updateMany({ where: { workspaceId, date: previousDate }, data: { date: entry.date } });
        await tx.calendarEntry.deleteMany({ where: { workspaceId, date: previousDate } });
      }
      await tx.calendarEntry.upsert({
        where: { workspaceId_date: { workspaceId, date: entry.date } },
        create: { workspaceId, ...data },
        update: data
      });
    });
    return NextResponse.json({ entry });
  });
}
