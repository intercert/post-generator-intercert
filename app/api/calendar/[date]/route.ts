import { NextResponse } from 'next/server';
import { ENTRY_STATUSES, isValidDate, type EntryStatus } from '@/lib/calendar';
import { ApiError, currentWorkspaceId, handle, jsonBody } from '@/lib/db';
import { getPrisma } from '@/lib/prisma';

type Context = { params: Promise<{ date: string }> };

async function dateOf(context: Context): Promise<string> {
  const { date } = await context.params;
  if (!isValidDate(date)) throw new ApiError('Data inválida.', 400);
  return date;
}

/** Muda só a situação do dia (A fazer, Gerado, Postado). */
export async function PATCH(req: Request, context: Context) {
  return handle(async () => {
    const date = await dateOf(context);
    const body = await jsonBody(req);
    if (!(ENTRY_STATUSES as readonly string[]).includes(body.status as string)) {
      throw new ApiError('Situação inválida.', 400);
    }
    const workspaceId = await currentWorkspaceId();
    const { count } = await getPrisma().calendarEntry.updateMany({
      where: { workspaceId, date },
      data: { status: body.status as EntryStatus }
    });
    if (count === 0) throw new ApiError('Dia não encontrado no calendário.', 404);
    return NextResponse.json({ ok: true });
  });
}

/** Remove o dia e o post gerado dele. */
export async function DELETE(_req: Request, context: Context) {
  return handle(async () => {
    const date = await dateOf(context);
    const workspaceId = await currentWorkspaceId();
    const prisma = getPrisma();
    await prisma.$transaction([
      prisma.post.deleteMany({ where: { workspaceId, date } }),
      prisma.calendarEntry.deleteMany({ where: { workspaceId, date } })
    ]);
    return NextResponse.json({ ok: true });
  });
}
