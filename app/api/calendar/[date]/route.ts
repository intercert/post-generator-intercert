import { NextResponse } from 'next/server';
import { ENTRY_STATUSES, isValidDate, type EntryStatus } from '@/lib/calendar';
import { ApiError, currentWorkspaceId, handle, jsonBody, slotOf } from '@/lib/db';
import { getPrisma } from '@/lib/prisma';

type Context = { params: Promise<{ date: string }> };

async function dateOf(context: Context): Promise<string> {
  const { date } = await context.params;
  if (!isValidDate(date)) throw new ApiError('Data inválida.', 400);
  return date;
}

/** Muda só a situação de um post do dia (A fazer, Gerado, Postado). A posição vem em ?slot=. */
export async function PATCH(req: Request, context: Context) {
  return handle(async () => {
    const date = await dateOf(context);
    const slot = slotOf(req);
    const body = await jsonBody(req);
    if (!(ENTRY_STATUSES as readonly string[]).includes(body.status as string)) {
      throw new ApiError('Situação inválida.', 400);
    }
    const workspaceId = await currentWorkspaceId();
    const { count } = await getPrisma().calendarEntry.updateMany({
      where: { workspaceId, date, slot },
      data: { status: body.status as EntryStatus }
    });
    if (count === 0) throw new ApiError('Post não encontrado no calendário.', 404);
    return NextResponse.json({ ok: true });
  });
}

/** Remove um post do dia (posição em ?slot=) e a arte gerada dele. */
export async function DELETE(req: Request, context: Context) {
  return handle(async () => {
    const date = await dateOf(context);
    const slot = slotOf(req);
    const workspaceId = await currentWorkspaceId();
    const prisma = getPrisma();
    await prisma.$transaction([
      prisma.post.deleteMany({ where: { workspaceId, date, slot } }),
      prisma.calendarEntry.deleteMany({ where: { workspaceId, date, slot } })
    ]);
    return NextResponse.json({ ok: true });
  });
}
