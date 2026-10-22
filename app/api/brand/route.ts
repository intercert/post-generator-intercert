import { NextResponse, connection } from 'next/server';
import { ApiError, currentWorkspaceId, handle, jsonBody } from '@/lib/db';
import { brandFromRow, brandToRow } from '@/lib/db-mappers';
import { getPrisma } from '@/lib/prisma';

// Identidade visual da empresa: um registro por empresa.

export async function GET() {
  await connection();
  return handle(async () => {
    const workspaceId = await currentWorkspaceId();
    const row = await getPrisma().brand.findUnique({ where: { workspaceId } });
    return NextResponse.json({ brand: row ? brandFromRow(row) : null });
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    const body = await jsonBody(req);
    if (typeof body.brand !== 'object' || body.brand === null) throw new ApiError('Envie a identidade em "brand".', 400);

    const workspaceId = await currentWorkspaceId();
    const data = brandToRow(body.brand);
    const row = await getPrisma().brand.upsert({
      where: { workspaceId },
      create: { workspaceId, ...data },
      update: data
    });
    return NextResponse.json({ brand: brandFromRow(row) });
  });
}

export async function DELETE() {
  return handle(async () => {
    const workspaceId = await currentWorkspaceId();
    const prisma = getPrisma();
    await prisma.brand.deleteMany({ where: { workspaceId } });
    // As referências pertencem à identidade que acabou de ser apagada
    await prisma.brandSample.deleteMany({ where: { workspaceId } });
    return NextResponse.json({ ok: true });
  });
}
