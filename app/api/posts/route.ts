import { NextResponse, connection } from 'next/server';
import { currentWorkspaceId, handle } from '@/lib/db';
import { postMetaSelect, toPostMeta } from '@/lib/post-rows';
import { getPrisma } from '@/lib/prisma';

/** Lista leve dos posts salvos (sem a imagem). A imagem de cada um vem de /api/posts/AAAA-MM-DD/image?slot=N. */
export async function GET() {
  await connection();
  return handle(async () => {
    const workspaceId = await currentWorkspaceId();
    const rows = await getPrisma().post.findMany({
      where: { workspaceId },
      select: postMetaSelect,
      orderBy: [{ date: 'asc' }, { slot: 'asc' }]
    });
    return NextResponse.json({ posts: rows.map(toPostMeta) });
  });
}
