import { NextResponse, connection } from 'next/server';
import { LAYOUT_KINDS } from '@/lib/brand';
import { isValidDate } from '@/lib/calendar';
import { ApiError, currentWorkspaceId, handle, jsonBody, slotOf } from '@/lib/db';
import { getPrisma } from '@/lib/prisma';
import { postDetailSelect, toPostDetail } from '@/lib/post-rows';

type Context = { params: Promise<{ date: string }> };

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

async function dateOf(context: Context): Promise<string> {
  const { date } = await context.params;
  if (!isValidDate(date)) throw new ApiError('Data inválida.', 400);
  return date;
}

const clip = (value: FormDataEntryValue | null, max: number): string =>
  typeof value === 'string' ? value.slice(0, max) : '';

/** Post salvo do dia (posição em ?slot=), com os prompts completos (sem a imagem, que tem rota própria). */
export async function GET(req: Request, context: Context) {
  await connection();
  return handle(async () => {
    const date = await dateOf(context);
    const slot = slotOf(req);
    const workspaceId = await currentWorkspaceId();
    const row = await getPrisma().post.findUnique({
      where: { workspaceId_date_slot: { workspaceId, date, slot } },
      select: postDetailSelect
    });
    if (!row) throw new ApiError('Este dia ainda não tem post salvo.', 404);
    return NextResponse.json({ post: toPostDetail(row) });
  });
}

/** Salva (ou substitui) o post do dia. Corpo em multipart: campos de texto e o arquivo "image". */
export async function PUT(req: Request, context: Context) {
  return handle(async () => {
    const date = await dateOf(context);
    const slot = slotOf(req);

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ApiError('Envie os dados do post como formulário (multipart).', 400);
    }

    const image = form.get('image');
    if (!(image instanceof File) || image.size === 0) throw new ApiError('Envie a imagem do post em "image".', 400);
    if (image.size > MAX_IMAGE_BYTES) throw new ApiError('A imagem do post é grande demais (máximo 12 MB).', 413);

    const layoutRaw = clip(form.get('layout'), 20);
    const data = {
      titulo: clip(form.get('titulo'), 255),
      layout: (LAYOUT_KINDS as readonly string[]).includes(layoutRaw) ? layoutRaw : 'cartao',
      formatId: clip(form.get('formatId'), 80),
      legenda: clip(form.get('legenda'), 5000),
      usedProvider: clip(form.get('usedProvider'), 120),
      imageProvider: clip(form.get('imageProvider'), 160),
      imageWarning: clip(form.get('imageWarning'), 1000),
      imagePrompt: clip(form.get('imagePrompt'), 4000),
      imageJson: clip(form.get('imageJson'), 60_000),
      postPrompt: clip(form.get('postPrompt'), 60_000),
      postJson: clip(form.get('postJson'), 60_000),
      brandJson: clip(form.get('brandJson'), 120_000),
      imageType: image.type && image.type.startsWith('image/') ? image.type.slice(0, 40) : 'image/png',
      image: new Uint8Array(await image.arrayBuffer())
    };
    if (!data.formatId) throw new ApiError('Informe o formato do post (formatId).', 400);

    const workspaceId = await currentWorkspaceId();
    const row = await getPrisma().post.upsert({
      where: { workspaceId_date_slot: { workspaceId, date, slot } },
      create: { workspaceId, date, slot, ...data },
      update: data,
      select: { updatedAt: true }
    });
    return NextResponse.json({ date, slot, savedAt: row.updatedAt.getTime() });
  });
}

/** Atualiza só a legenda (a pessoa pode editá-la na tela). */
export async function PATCH(req: Request, context: Context) {
  return handle(async () => {
    const date = await dateOf(context);
    const slot = slotOf(req);
    const body = await jsonBody(req);
    if (typeof body.legenda !== 'string') throw new ApiError('Envie a legenda em "legenda".', 400);

    const workspaceId = await currentWorkspaceId();
    const { count } = await getPrisma().post.updateMany({
      where: { workspaceId, date, slot },
      data: { legenda: body.legenda.slice(0, 5000) }
    });
    if (count === 0) throw new ApiError('Este dia ainda não tem post salvo.', 404);
    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(req: Request, context: Context) {
  return handle(async () => {
    const date = await dateOf(context);
    const slot = slotOf(req);
    const workspaceId = await currentWorkspaceId();
    await getPrisma().post.deleteMany({ where: { workspaceId, date, slot } });
    return NextResponse.json({ ok: true });
  });
}
