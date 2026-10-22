import { NextResponse, connection } from 'next/server';
import { normalizeEntry, parseSlot } from '@/lib/calendar';
import { ApiError, currentWorkspaceId, handle, jsonBody } from '@/lib/db';
import { entryFromRow, entryToData } from '@/lib/db-mappers';
import { getPrisma } from '@/lib/prisma';

// Calendário: até 2 posts planejados por data (posições 1 e 2).

export async function GET() {
  await connection();
  return handle(async () => {
    const workspaceId = await currentWorkspaceId();
    const rows = await getPrisma().calendarEntry.findMany({ where: { workspaceId }, orderBy: [{ date: 'asc' }, { slot: 'asc' }] });
    const entries = rows.map(entryFromRow).filter((e) => e !== null);
    return NextResponse.json({ entries });
  });
}

/** Cria ou atualiza um post do calendário. Se a data ou a posição mudou, `previousDate` e `previousSlot` dizem qual item antigo sai do lugar. */
export async function PUT(req: Request) {
  return handle(async () => {
    const body = await jsonBody(req);
    const entry = normalizeEntry(body.entry);
    if (!entry) throw new ApiError('Dia inválido. Confira a data (AAAA-MM-DD).', 400);
    const previous =
      typeof body.previousDate === 'string' ? { date: body.previousDate, slot: parseSlot(body.previousSlot) ?? 1 } : undefined;
    const moved = previous !== undefined && (previous.date !== entry.date || previous.slot !== entry.slot);

    const workspaceId = await currentWorkspaceId();
    const prisma = getPrisma();
    const data = entryToData(entry);

    await prisma.$transaction(async (tx) => {
      if (previous && moved) {
        const taken = await tx.calendarEntry.findUnique({
          where: { workspaceId_date_slot: { workspaceId, date: entry.date, slot: entry.slot } },
          select: { id: true }
        });
        if (taken) throw new ApiError('Esse dia já tem um post nessa posição.', 409);
        // O post gerado acompanha o item que mudou de data ou de posição
        await tx.post.updateMany({
          where: { workspaceId, date: previous.date, slot: previous.slot },
          data: { date: entry.date, slot: entry.slot }
        });
        await tx.calendarEntry.deleteMany({ where: { workspaceId, date: previous.date, slot: previous.slot } });
      }
      await tx.calendarEntry.upsert({
        where: { workspaceId_date_slot: { workspaceId, date: entry.date, slot: entry.slot } },
        create: { workspaceId, ...data },
        update: data
      });
    });
    return NextResponse.json({ entry });
  });
}
