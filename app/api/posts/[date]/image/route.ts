import { connection } from 'next/server';
import { isValidDate } from '@/lib/calendar';
import { ApiError, currentWorkspaceId, handle } from '@/lib/db';
import { getPrisma } from '@/lib/prisma';

type Context = { params: Promise<{ date: string }> };

/** A arte final do dia, como imagem (serve direto num <img>). Usa ETag para não baixar de novo sem necessidade. */
export async function GET(req: Request, context: Context) {
  await connection();
  return handle(async () => {
    const { date } = await context.params;
    if (!isValidDate(date)) throw new ApiError('Data inválida.', 400);

    const workspaceId = await currentWorkspaceId();
    const row = await getPrisma().post.findUnique({
      where: { workspaceId_date: { workspaceId, date } },
      select: { image: true, imageType: true, updatedAt: true }
    });
    if (!row) throw new ApiError('Este dia ainda não tem post salvo.', 404);

    const etag = `"${row.updatedAt.getTime()}"`;
    const headers = { ETag: etag, 'Cache-Control': 'private, max-age=0, must-revalidate' };
    if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });

    return new Response(Buffer.from(row.image), { headers: { ...headers, 'Content-Type': row.imageType } });
  });
}
