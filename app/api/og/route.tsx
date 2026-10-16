import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ReactElement } from 'react';
import { getFormat } from '@/lib/formats';
import {
  LAYOUT_KINDS,
  formatKindOfSize,
  hexToRgba,
  inkOn,
  layoutsFor,
  logoPositionFor,
  normalizeBrand,
  type Brand,
  type LayoutKind,
  type LogoPosition
} from '@/lib/brand';

const BASE_SIZE = 1080;

// A arte é montada por código: logo, fonte, cores e caixas saem idênticas a cada post.
// A IA só entra com a imagem de fundo (bgUrl).
const FONT_FILES: [400 | 500 | 700 | 800, string][] = [
  [400, 'poppins-latin-400-normal.woff'],
  [500, 'poppins-latin-500-normal.woff'],
  [700, 'poppins-latin-700-normal.woff'],
  [800, 'poppins-latin-800-normal.woff']
];

let fontsPromise: Promise<{ name: string; data: ArrayBuffer; weight: 400 | 500 | 700 | 800; style: 'normal' }[]> | null =
  null;

function loadFonts() {
  fontsPromise ??= Promise.all(
    FONT_FILES.map(async ([weight, file]) => {
      const buf = await readFile(path.join(process.cwd(), 'assets', 'fonts', file));
      const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      return { name: 'Poppins', data, weight, style: 'normal' as const };
    })
  ).catch((err) => {
    fontsPromise = null;
    throw err;
  });
  return fontsPromise;
}

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function text(value: unknown, fallback: string, max: number): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;
}

// ---------- Texto do título com **frase-chave** ----------

interface TitlePart {
  text: string;
  hl: boolean;
}

function parseTitle(titulo: string): TitlePart[] {
  const parts: TitlePart[] = [];
  titulo.split(/\*\*(.+?)\*\*/g).forEach((chunk, i) => {
    if (chunk.trim()) parts.push({ text: chunk.trim(), hl: i % 2 === 1 });
  });
  return parts.length ? parts : [{ text: titulo.replace(/\*\*/g, ''), hl: false }];
}

function titleNode(
  parts: TitlePart[],
  o: { size: number; color: string; hlColor: string; hlInk: string; style: Brand['destaqueEstilo']; center?: boolean; weight?: number }
): ReactElement {
  const items: ReactElement[] = [];
  parts.forEach((part, pi) => {
    if (part.hl && o.style === 'caixa') {
      items.push(
        <div
          key={`p${pi}`}
          style={{
            display: 'flex',
            background: o.hlColor,
            color: o.hlInk,
            fontWeight: 700,
            padding: `${Math.round(o.size * 0.02)}px ${Math.round(o.size * 0.2)}px ${Math.round(o.size * 0.06)}px`,
            borderRadius: Math.round(o.size * 0.22)
          }}
        >
          {part.text}
        </div>
      );
      return;
    }
    part.text.split(/\s+/).forEach((word, wi) => {
      items.push(
        <div
          key={`p${pi}w${wi}`}
          style={{ display: 'flex', ...(part.hl ? { fontWeight: 800, color: o.hlColor } : {}) }}
        >
          {word}
        </div>
      );
    });
  });

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: o.center ? 'center' : 'flex-start',
        columnGap: Math.round(o.size * 0.26),
        rowGap: Math.round(o.size * 0.08),
        fontSize: o.size,
        fontWeight: o.weight ?? 500,
        lineHeight: 1.16,
        letterSpacing: -Math.round(o.size * 0.012),
        color: o.color
      }}
    >
      {items}
    </div>
  );
}

// ---------- Fundo decorativo ----------

function patternUri(kind: Brand['motivo'], color: string, W: number, H: number, s: number, alpha: number): string | null {
  if (kind === 'nenhum') return null;
  const fill = color;
  let body = '';

  if (kind === 'hexagonos') {
    // Hexágonos grandes, quase transparentes e cortados pelas bordas, mais visíveis nos cantos
    // superior esquerdo e inferior direito e sumindo em direção ao centro.
    const r = 230 * s;
    const dx = Math.sqrt(3) * r;
    const dy = 1.5 * r;
    const reach = Math.hypot(W, H) * 0.55;
    for (let row = -1; row * dy < H + r; row++) {
      for (let col = -1; col * dx < W + dx; col++) {
        const cx = col * dx + (row % 2 ? dx / 2 : 0);
        const cy = row * dy;
        const d = Math.min(Math.hypot(cx, cy), Math.hypot(W - cx, H - cy));
        const t = Math.max(0, 1 - d / reach);
        if (t < 0.04) continue;
        const pts = [0, 1, 2, 3, 4, 5]
          .map((i) => {
            const a = (Math.PI / 180) * (60 * i - 30);
            return `${(cx + r * 0.95 * Math.cos(a)).toFixed(1)},${(cy + r * 0.95 * Math.sin(a)).toFixed(1)}`;
          })
          .join(' ');
        body += `<polygon points="${pts}" fill="${fill}" fill-opacity="${(t ** 1.2).toFixed(3)}"/>`;
      }
    }
  } else if (kind === 'circulos') {
    const r = 120 * s;
    for (let row = 0; row * r * 2 < H + r; row++) {
      for (let col = 0; col * r * 2 < W + r; col++) {
        body += `<circle cx="${(col * r * 2 + r).toFixed(1)}" cy="${(row * r * 2 + r).toFixed(1)}" r="${(r * 0.92).toFixed(1)}" fill="none" stroke="${fill}" stroke-width="${Math.max(1, 2 * s).toFixed(1)}"/>`;
      }
    }
  } else {
    const step = 90 * s;
    for (let x = 0; x < W; x += step) body += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${fill}" stroke-width="${Math.max(1, 2 * s).toFixed(1)}"/>`;
    for (let y = 0; y < H; y += step) body += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${fill}" stroke-width="${Math.max(1, 2 * s).toFixed(1)}"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g opacity="${alpha}">${body}</g></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ---------- Logo ----------

const PNG_PREFIX = 'data:image/png;base64,';

function pngSize(dataUrl: string): { w: number; h: number } | null {
  try {
    const head = Buffer.from(dataUrl.slice(PNG_PREFIX.length, PNG_PREFIX.length + 48), 'base64');
    if (head.length < 24) return null;
    const w = head.readUInt32BE(16);
    const h = head.readUInt32BE(20);
    return w > 0 && h > 0 ? { w, h } : null;
  } catch {
    return null;
  }
}

/** Logo da marca: a imagem enviada (numa pílula branca se o fundo é escuro e não há versão clara) ou o nome em texto. */
function logoNode(brand: Brand, o: { maxH: number; maxW: number; onDark: boolean; s: number }): ReactElement {
  const src = o.onDark && brand.logoClara ? brand.logoClara : brand.logo;
  const size = src ? pngSize(src) : null;

  if (src && size) {
    const k = Math.min(o.maxH / size.h, o.maxW / size.w);
    const w = Math.round(size.w * k);
    const h = Math.round(size.h * k);
    const needsPill = o.onDark && !brand.logoClara;
    const pad = Math.round(o.maxH * 0.22);
    const img = (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} width={w} height={h} alt="" style={{ width: w, height: h }} />
    );
    if (!needsPill) return <div style={{ display: 'flex' }}>{img}</div>;
    return (
      <div
        style={{
          display: 'flex',
          background: '#FFFFFF',
          padding: `${pad}px ${pad * 1.6}px`,
          borderRadius: Math.round(o.maxH * 0.5 + pad)
        }}
      >
        {img}
      </div>
    );
  }

  // Sem logo cadastrada: ícone com a cor principal + nome
  const ink = o.onDark ? '#FFFFFF' : brand.corTexto;
  const icon = Math.round(o.maxH * 0.8);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(icon * 0.3) }}>
      <div
        style={{
          width: icon,
          height: icon,
          borderRadius: Math.round(icon * 0.25),
          background: brand.corPrimaria,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <div
          style={{
            width: Math.round(icon * 0.3),
            height: Math.round(icon * 0.3),
            background: inkOn(brand.corPrimaria),
            transform: 'rotate(45deg)'
          }}
        />
      </div>
      <div style={{ display: 'flex', fontSize: Math.round(icon * 0.62), fontWeight: 800, color: ink }}>
        {brand.nome}
      </div>
    </div>
  );
}

const JUSTIFY: Record<LogoPosition, 'flex-start' | 'center' | 'flex-end'> = {
  'rodape-centro': 'center',
  'rodape-direita': 'flex-end',
  'rodape-esquerda': 'flex-start',
  'topo-esquerda': 'flex-start',
  'topo-centro': 'center'
};

// ---------- Layouts ----------

interface Ctx {
  W: number;
  H: number;
  s: number;
  px: (n: number) => number;
  R: number;
  padX: number;
  padTop: number;
  padBottom: number;
  brand: Brand;
  parts: TitlePart[];
  titulo: string;
  eyebrow: string;
  subtitulo: string;
  itens: string[];
  cta: string;
  bgUrl: string;
}

function titleSize(ctx: Ctx, base: number): number {
  const len = ctx.titulo.replace(/\*\*/g, '').length;
  const k = len > 70 ? 0.74 : len > 55 ? 0.82 : len > 40 ? 0.92 : 1;
  return ctx.px(base * k);
}

function photo(ctx: Ctx, style: Record<string, string | number>): ReactElement {
  return (
    <div style={{ display: 'flex', position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #EEF0F5 0%, #D9DDE8 100%)', ...style }}>
      {ctx.bgUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ctx.bgUrl}
          alt=""
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
    </div>
  );
}

function eyebrowPill(ctx: Ctx, onDark: boolean): ReactElement | null {
  if (!ctx.eyebrow) return null;
  const color = onDark ? '#FFFFFF' : ctx.brand.corPrimaria;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        border: `${Math.max(1, ctx.px(1.5))}px solid ${color}`,
        color,
        borderRadius: 9999,
        padding: `${ctx.px(8)}px ${ctx.px(22)}px`,
        fontSize: ctx.px(17),
        fontWeight: 500,
        letterSpacing: ctx.px(2.4),
        textTransform: 'uppercase'
      }}
    >
      {ctx.eyebrow}
    </div>
  );
}

function logoRow(ctx: Ctx, onDark: boolean, maxH: number): ReactElement {
  return (
    <div style={{ display: 'flex', width: '100%', justifyContent: JUSTIFY[ctx.brand.logoPosicao] }}>
      {logoNode(ctx.brand, { maxH, maxW: ctx.px(380), onDark, s: ctx.s })}
    </div>
  );
}

function ctaText(ctx: Ctx, color: string): ReactElement | null {
  if (!ctx.cta) return null;
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        justifyContent: JUSTIFY[ctx.brand.logoPosicao],
        color,
        fontSize: ctx.px(22),
        fontWeight: 700,
        marginBottom: ctx.px(12)
      }}
    >
      {ctx.cta}
    </div>
  );
}

function renderCartao(ctx: Ctx): ReactElement {
  const { W, H, brand, px, R } = ctx;
  const logoTop = brand.logoPosicao.startsWith('topo');
  const logoH = px(46);
  const footerH = logoTop ? 0 : logoH + px(46) + (ctx.cta ? px(34) : 0);
  const headerH = ctx.eyebrow || logoTop ? px(64) : 0;

  const photoTop = ctx.padTop + headerH;
  const avail = H - photoTop - Math.max(ctx.padBottom, px(40)) - footerH;
  const photoH = Math.round(avail * 0.72);
  const boxTop = photoTop + photoH - Math.round(avail * 0.16);
  const boxH = photoTop + avail - boxTop;

  const boxColor = brand.caixaApoio === 'destaque' ? brand.corDestaque : brand.corPrimaria;
  const hlColor = boxColor === brand.corPrimaria ? brand.corDestaque : brand.corPrimaria;
  const boxInk = inkOn(boxColor, brand.corTexto);

  return (
    <>
      {/* bloco de destaque atrás da foto */}
      <div
        style={{
          position: 'absolute',
          left: ctx.padX - px(22),
          top: photoTop - px(22),
          width: W - ctx.padX * 2 + px(22),
          height: photoH + px(22),
          borderRadius: R + px(6),
          background: brand.corDestaque
        }}
      />
      {photo(ctx, { position: 'absolute', left: ctx.padX, top: photoTop, width: W - ctx.padX * 2, height: photoH, borderRadius: R })}

      <div
        style={{
          position: 'absolute',
          left: ctx.padX,
          top: boxTop,
          width: W - ctx.padX * 2,
          height: boxH,
          background: boxColor,
          borderRadius: R,
          padding: `${px(26)}px ${px(38)}px`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          boxShadow: `0 ${px(14)}px ${px(34)}px ${hexToRgba(brand.corPrimaria, 0.25)}`
        }}
      >
        {titleNode(ctx.parts, { size: titleSize(ctx, 58), color: boxInk, hlColor, hlInk: inkOn(hlColor), style: brand.destaqueEstilo })}
        {ctx.subtitulo && (
          <div style={{ display: 'flex', marginTop: px(14), fontSize: px(25), lineHeight: 1.35, color: hexToRgba(boxInk, 0.82) }}>
            {ctx.subtitulo}
          </div>
        )}
      </div>

      {/* cabeçalho */}
      <div
        style={{
          position: 'absolute',
          left: ctx.padX,
          top: ctx.padTop,
          width: W - ctx.padX * 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: logoTop && ctx.eyebrow ? 'space-between' : logoTop ? JUSTIFY[brand.logoPosicao] : 'flex-start'
        }}
      >
        {eyebrowPill(ctx, false)}
        {logoTop && logoNode(brand, { maxH: logoH, maxW: px(340), onDark: false, s: ctx.s })}
      </div>

      {/* rodapé */}
      {!logoTop && (
        <div
          style={{
            position: 'absolute',
            left: ctx.padX,
            bottom: Math.max(ctx.padBottom, px(40)),
            width: W - ctx.padX * 2,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {ctaText(ctx, brand.corPrimaria)}
          {logoRow(ctx, false, logoH)}
        </div>
      )}
    </>
  );
}

const svgUri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

/** Círculo na cor de destaque com um check (ou uma seta) por dentro, como nos itens de lista e no botão. */
function badgeIcon(kind: 'check' | 'arrow', size: number, fill: string, ink: string): ReactElement {
  const glyph =
    kind === 'check'
      ? `<path d="M7 12.6l3.3 3.3L17 9.2" stroke="${ink}" stroke-width="2.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="M6.5 12h10.5M12.8 7.6L17.2 12l-4.4 4.4" stroke="${ink}" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="${fill}"/>${glyph}</svg>`;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={svgUri(svg)} width={size} height={size} alt="" style={{ width: size, height: size, flexShrink: 0 }} />;
}

/** Foto na arte toda; título em texto sobre a parte clara, card de apoio na cor principal, botão e logo embaixo. */
function renderTelaCheia(ctx: Ctx): ReactElement {
  const { W, H, brand, px, R } = ctx;
  const logoH = px(46);
  const bullets = ctx.itens;
  const hlColor = brand.corDestaque;
  const cardInk = inkOn(brand.corPrimaria);
  const accentInk = inkOn(brand.corDestaque);
  const ink = brand.corTexto;
  const cardWidth = Math.min(W - ctx.padX * 2, Math.round(W * 0.64));
  const white = (a: number) => `rgba(255, 255, 255, ${a})`;

  return (
    <>
      {photo(ctx, { position: 'absolute', left: 0, top: 0, width: W, height: H })}
      {/* névoa clara no topo (onde fica o título) e no rodapé (onde fica a logo colorida) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: W,
          height: H,
          background: `linear-gradient(180deg, ${white(0.92)} 0%, ${white(0.78)} 16%, ${white(0)} 46%, ${white(0)} 74%, ${white(0.9)} 100%)`
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: ctx.padX,
          top: ctx.padTop,
          width: W - ctx.padX * 2,
          height: H - ctx.padTop - ctx.padBottom,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {ctx.eyebrow && (
          <div style={{ display: 'flex', alignItems: 'center', gap: px(18), marginBottom: px(26) }}>
            <div
              style={{
                display: 'flex',
                color: brand.corPrimaria,
                fontSize: px(18),
                fontWeight: 600,
                letterSpacing: px(5),
                textTransform: 'uppercase'
              }}
            >
              {ctx.eyebrow}
            </div>
            <div style={{ display: 'flex', flex: 1, maxWidth: px(220), height: Math.max(2, px(2)), background: brand.corPrimaria }} />
          </div>
        )}

        <div style={{ display: 'flex', maxWidth: Math.round(W * 0.8) }}>
          {titleNode(ctx.parts, {
            size: titleSize(ctx, 74),
            weight: 700,
            color: ink,
            hlColor,
            hlInk: accentInk,
            style: brand.destaqueEstilo
          })}
        </div>

        {(bullets.length > 0 || ctx.subtitulo) && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignSelf: 'flex-start',
              width: cardWidth,
              marginTop: px(34),
              background: `linear-gradient(160deg, ${brand.corPrimaria} 0%, ${hexToRgba(brand.corPrimaria, 0.92)} 100%)`,
              borderRadius: R,
              padding: `${px(28)}px ${px(34)}px`,
              gap: px(16),
              color: cardInk,
              boxShadow: `0 ${px(14)}px ${px(34)}px ${hexToRgba(brand.corPrimaria, 0.28)}`
            }}
          >
            {ctx.subtitulo && (
              <div style={{ display: 'flex', fontSize: px(27), fontWeight: 500, lineHeight: 1.35 }}>{ctx.subtitulo}</div>
            )}
            {bullets.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: px(16), fontSize: px(26), fontWeight: 500 }}>
                {badgeIcon('check', px(40), brand.corDestaque, accentInk)}
                <div style={{ display: 'flex', flex: 1 }}>{item}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flex: 1 }} />

        {ctx.cta && (
          <div
            style={{
              display: 'flex',
              alignSelf: JUSTIFY[brand.logoPosicao] === 'center' ? 'center' : JUSTIFY[brand.logoPosicao],
              alignItems: 'center',
              gap: px(16),
              marginBottom: px(30),
              padding: `${px(12)}px ${px(30)}px ${px(12)}px ${px(14)}px`,
              borderRadius: 9999,
              background: brand.corDestaque,
              color: accentInk,
              fontSize: px(28),
              fontWeight: 700
            }}
          >
            {badgeIcon('arrow', px(44), accentInk, brand.corDestaque)}
            {ctx.cta}
          </div>
        )}
        {logoRow(ctx, false, logoH)}
      </div>
    </>
  );
}

function renderProduto(ctx: Ctx): ReactElement {
  const { W, H, brand, px, R } = ctx;
  const splitAt = Math.round(H * 0.58);
  const hlColor = brand.corDestaque;
  const itens = ctx.itens;

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: splitAt,
          width: W,
          height: H - splitAt,
          background: brand.corPrimaria
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: ctx.padX,
          top: ctx.padTop,
          width: W - ctx.padX * 2,
          height: H - ctx.padTop - ctx.padBottom,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
      >
        {ctx.eyebrow && <div style={{ display: 'flex', marginBottom: px(16) }}>{eyebrowPill(ctx, false)}</div>}

        <div style={{ display: 'flex' }}>{logoNode(brand, { maxH: px(92), maxW: px(520), onDark: false, s: ctx.s })}</div>

        <div style={{ display: 'flex', marginTop: px(22), width: '100%', justifyContent: 'center', textAlign: 'center' }}>
          {titleNode(ctx.parts, {
            size: titleSize(ctx, 44),
            color: brand.corTexto,
            hlColor: brand.corDestaque === hlColor ? brand.corDestaque : hlColor,
            hlInk: inkOn(hlColor),
            style: brand.destaqueEstilo,
            center: true
          })}
        </div>
        {ctx.subtitulo && (
          <div
            style={{
              display: 'flex',
              marginTop: px(12),
              fontSize: px(26),
              lineHeight: 1.35,
              color: hexToRgba(brand.corTexto, 0.78),
              textAlign: 'center',
              justifyContent: 'center'
            }}
          >
            {ctx.subtitulo}
          </div>
        )}

        {photo(ctx, {
          flex: 1,
          width: '100%',
          marginTop: px(26),
          marginBottom: itens.length || ctx.cta ? px(24) : 0,
          borderRadius: R,
          boxShadow: `0 ${px(16)}px ${px(36)}px rgba(0,0,0,0.25)`
        })}

        {itens.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexWrap: 'wrap',
              width: '100%',
              gap: px(10),
              background: brand.corDestaque,
              borderRadius: R,
              padding: `${px(14)}px ${px(22)}px`,
              color: inkOn(brand.corDestaque),
              fontSize: px(20),
              fontWeight: 700,
              letterSpacing: px(0.8),
              textTransform: 'uppercase'
            }}
          >
            {itens.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: px(10) }}>
                {i > 0 && <div style={{ display: 'flex', width: px(2), height: px(22), background: hexToRgba(inkOn(brand.corDestaque), 0.5) }} />}
                {item}
              </div>
            ))}
          </div>
        )}
        {ctx.cta && (
          <div style={{ display: 'flex', marginTop: px(18), fontSize: px(24), fontWeight: 700, color: inkOn(brand.corPrimaria) }}>
            {ctx.cta}
          </div>
        )}
      </div>
    </>
  );
}

const RENDERERS: Record<LayoutKind, (ctx: Ctx) => ReactElement> = {
  cartao: renderCartao,
  'tela-cheia': renderTelaCheia,
  produto: renderProduto
};

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (typeof parsed !== 'object' || parsed === null) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return fail('Corpo da requisição inválido. Envie um JSON.');
  }

  const formato = getFormat(body.formato);
  if (!formato) return fail('Formato inválido.');

  // Feed e story têm padrões próprios: a arte usa os layouts e a posição da logo do formato escolhido
  const saved = normalizeBrand(body.brand);
  const kind = formatKindOfSize(formato.width, formato.height);
  const brand: Brand = { ...saved, layouts: layoutsFor(saved, kind), logoPosicao: logoPositionFor(saved, kind) };
  const layout: LayoutKind =
    typeof body.layout === 'string' && (LAYOUT_KINDS as readonly string[]).includes(body.layout)
      ? (body.layout as LayoutKind)
      : brand.layouts[0].tipo;

  const titulo = text(body.titulo, 'Seu título **em destaque**', 140);
  const itens = Array.isArray(body.itens)
    ? body.itens
        .filter((i): i is string => typeof i === 'string' && i.trim().length > 0)
        .map((i) => i.trim().slice(0, 60))
        .slice(0, 5)
    : [];

  // Só imagens remotas por https ou embutidas em data:image
  let bgUrl = '';
  if (body.bgUrl !== undefined && body.bgUrl !== null && body.bgUrl !== '') {
    if (typeof body.bgUrl !== 'string' || !(body.bgUrl.startsWith('https://') || body.bgUrl.startsWith('data:image/'))) {
      return fail('bgUrl deve começar com https:// ou data:image/.');
    }
    bgUrl = body.bgUrl;
  }

  const { width: W, height: H, safeTop, safeBottom } = formato;

  // Tudo escala pela área do formato em relação ao quadrado de 1080
  const s = Math.sqrt(W * H) / BASE_SIZE;
  const px = (n: number) => Math.round(n * s);
  const pad = px(64);

  const ctx: Ctx = {
    W,
    H,
    s,
    px,
    R: px({ pequeno: 12, medio: 26, grande: 40 }[brand.raio]),
    padX: pad,
    padTop: Math.max(pad, safeTop),
    padBottom: Math.max(pad, safeBottom),
    brand,
    parts: parseTitle(titulo),
    titulo,
    eyebrow: text(body.eyebrow, '', 40),
    subtitulo: text(body.subtitulo, '', 220),
    itens,
    cta: text(body.cta, '', 60),
    bgUrl
  };

  const pattern = patternUri(brand.motivo, brand.corPrimaria, W, H, s, layout === 'tela-cheia' ? 0 : 0.07);

  let fonts;
  try {
    fonts = await loadFonts();
  } catch {
    return fail('Não foi possível carregar as fontes da arte.', 500);
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: brand.corFundo,
          fontFamily: 'Poppins'
        }}
      >
        {pattern && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pattern} alt="" width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }} />
        )}
        {RENDERERS[layout](ctx)}
      </div>
    ),
    { width: W, height: H, fonts }
  );
}
