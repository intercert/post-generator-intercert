import { NextResponse, connection } from 'next/server';
import { ApiError, currentWorkspaceId, handle, jsonBody } from '@/lib/db';
import { getPrisma } from '@/lib/prisma';
import {
  EMPTY_SAMPLE_COUNTS,
  MAX_SAMPLES_PER_KIND,
  MAX_SAMPLE_CHARS,
  SAMPLE_KINDS,
  type SampleCounts,
  type SampleInput,
  type SampleKind
} from '@/lib/samples';

// Amostras de referência da identidade visual (miniaturas dos posts de exemplo e do manual).
// A tela só precisa saber quantas existem; as imagens são lidas direto do banco pela geração.

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

async function counts(workspaceId: string): Promise<SampleCounts> {
  const rows = await getPrisma().brandSample.groupBy({ by: ['tipo'], where: { workspaceId }, _count: { _all: true } });
  const result: SampleCounts = { ...EMPTY_SAMPLE_COUNTS };
  for (const row of rows) {
    if ((SAMPLE_KINDS as readonly string[]).includes(row.tipo)) result[row.tipo as SampleKind] = row._count._all;
  }
  return result;
}

function parseSamples(value: unknown): SampleInput[] {
  if (!Array.isArray(value)) throw new ApiError('Envie as amostras em "amostras".', 400);
  const perKind: SampleCounts = { ...EMPTY_SAMPLE_COUNTS };

  return value.map((item): SampleInput => {
    const r = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
    const tipo = r.tipo;
    if (typeof tipo !== 'string' || !(SAMPLE_KINDS as readonly string[]).includes(tipo)) {
      throw new ApiError('Tipo de amostra inválido. Use feed, story ou manual.', 400);
    }
    if (++perKind[tipo as SampleKind] > MAX_SAMPLES_PER_KIND) {
      throw new ApiError(`Guarde no máximo ${MAX_SAMPLES_PER_KIND} amostras de cada tipo.`, 400);
    }
    const image = typeof r.image === 'string' ? r.image : '';
    if (!image || image.length > MAX_SAMPLE_CHARS || !BASE64.test(image)) {
      throw new ApiError('Amostra inválida ou grande demais.', 400);
    }
    const dimension = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(10_000, Math.max(1, Math.round(v))) : 1);
    return {
      tipo: tipo as SampleKind,
      nome: typeof r.nome === 'string' ? r.nome.trim().slice(0, 120) : '',
      largura: dimension(r.largura),
      altura: dimension(r.altura),
      image
    };
  });
}

export async function GET() {
  await connection();
  return handle(async () => NextResponse.json({ amostras: await counts(await currentWorkspaceId()) }));
}

/**
 * Troca as amostras dos tipos enviados. Quem enviou só stories não apaga as de feed, e vice-versa:
 * cada tipo presente na lista é substituído por inteiro, os demais ficam como estão.
 */
export async function PUT(req: Request) {
  return handle(async () => {
    const body = await jsonBody(req);
    const samples = parseSamples(body.amostras);
    const kinds = [...new Set(samples.map((s) => s.tipo))];

    const workspaceId = await currentWorkspaceId();
    const prisma = getPrisma();
    await prisma.$transaction(async (tx) => {
      await tx.brandSample.deleteMany({ where: { workspaceId, tipo: { in: kinds } } });
      // Uma linha por vez: cada miniatura cabe no pacote do banco, que um createMany somado poderia estourar
      for (const sample of samples) await tx.brandSample.create({ data: { workspaceId, ...sample } });
    });
    return NextResponse.json({ amostras: await counts(workspaceId) });
  });
}

export async function DELETE() {
  return handle(async () => {
    const workspaceId = await currentWorkspaceId();
    await getPrisma().brandSample.deleteMany({ where: { workspaceId } });
    return NextResponse.json({ amostras: { ...EMPTY_SAMPLE_COUNTS } });
  });
}
