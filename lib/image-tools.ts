// Ferramentas de imagem que rodam no navegador: reduzir posts para a análise, medir cores,
// recortar a logo e converter arquivos de logo para PNG.

export interface LoadedImage {
  /** JPEG reduzido, pronto para enviar à análise. */
  dataUrl: string;
  width: number;
  height: number;
}

export interface LogoBox {
  /** Número da imagem (a partir de 1) em que a logo foi localizada. */
  imagem: number;
  x: number;
  y: number;
  largura: number;
  altura: number;
}

function loadElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível abrir a imagem.'));
    img.src = src;
  });
}

async function loadFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await loadElement(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasOf(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('O navegador não conseguiu processar a imagem.');
  return { canvas, ctx };
}

/** Reduz a imagem para no máximo `max` pixels no maior lado e converte para JPEG. */
export async function fileToJpeg(file: File, max = 1280): Promise<LoadedImage> {
  const img = await loadFile(file);
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const { canvas, ctx } = canvasOf(img.naturalWidth * k, img.naturalHeight * k);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), width: canvas.width, height: canvas.height };
}

/** Miniatura JPEG (só o base64, sem o prefixo "data:") para guardar como referência visual no banco. */
export async function thumbnailJpeg(dataUrl: string, max: number, quality = 0.78): Promise<{ base64: string; width: number; height: number }> {
  const img = await loadElement(dataUrl);
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const { canvas, ctx } = canvasOf(img.naturalWidth * k, img.naturalHeight * k);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const out = canvas.toDataURL('image/jpeg', quality);
  return { base64: out.slice(out.indexOf(',') + 1), width: canvas.width, height: canvas.height };
}

/** Ajusta a imagem ao tamanho exato do formato (preenche e corta o excesso, como object-fit: cover) e devolve um PNG. */
export async function coverToPng(dataUrl: string, width: number, height: number): Promise<Blob> {
  const img = await loadElement(dataUrl);
  const { canvas, ctx } = canvasOf(width, height);
  const k = Math.max(width / img.naturalWidth, height / img.naturalHeight);
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k;
  ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível gerar o PNG da arte.'))), 'image/png')
  );
}

/** Converte um arquivo de logo para PNG (mantém transparência) com no máximo `max` pixels. */
export async function fileToPng(file: File, max = 700): Promise<string> {
  const img = await loadFile(file);
  const w = img.naturalWidth || 400;
  const h = img.naturalHeight || 400;
  const k = Math.min(1, max / Math.max(w, h));
  const { canvas, ctx } = canvasOf(w * k, h * k);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

/** Recorta a região indicada (valores de 0 a 1) e devolve um PNG. */
export async function cropToPng(dataUrl: string, box: Omit<LogoBox, 'imagem'>, pad = 0.04, max = 700): Promise<string> {
  const img = await loadElement(dataUrl);
  const W = img.naturalWidth;
  const H = img.naturalHeight;

  const x0 = Math.max(0, box.x - box.largura * pad);
  const y0 = Math.max(0, box.y - box.altura * pad);
  const x1 = Math.min(1, box.x + box.largura * (1 + pad));
  const y1 = Math.min(1, box.y + box.altura * (1 + pad));
  const sw = Math.max(8, (x1 - x0) * W);
  const sh = Math.max(8, (y1 - y0) * H);

  const k = Math.min(1, max / Math.max(sw, sh));
  const { canvas, ctx } = canvasOf(sw * k, sh * k);
  ctx.drawImage(img, x0 * W, y0 * H, sw, sh, 0, 0, canvas.width, canvas.height);
  knockOutLightBackground(ctx, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

/**
 * Se os cantos do recorte são claros (logo sobre fundo branco ou com marca d'água pálida), deixa o
 * fundo claro transparente, para a logo servir sobre qualquer cor. Logos de fundo escuro não são tocadas.
 */
function knockOutLightBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const image = ctx.getImageData(0, 0, w, h);
  const { data } = image;
  const minChannel = (i: number) => Math.min(data[i], data[i + 1], data[i + 2]);

  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4];
  if (!corners.every((i) => minChannel(i) >= 225)) return;

  const OPAQUE_BELOW = 205;
  const CLEAR_ABOVE = 232;
  for (let i = 0; i < data.length; i += 4) {
    const m = minChannel(i);
    if (m >= CLEAR_ABOVE) data[i + 3] = 0;
    else if (m > OPAQUE_BELOW) data[i + 3] = Math.round(((CLEAR_ABOVE - m) / (CLEAR_ABOVE - OPAQUE_BELOW)) * data[i + 3]);
  }
  ctx.putImageData(image, 0, 0);
}

const toHex = (n: number) => n.toString(16).padStart(2, '0');

/** Cores que mais aparecem nas imagens, medidas nos pixels (não estimadas por IA). */
export async function dominantColors(dataUrls: string[], count = 8): Promise<string[]> {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();

  for (const url of dataUrls) {
    const img = await loadElement(url);
    const k = 96 / Math.max(img.naturalWidth, img.naturalHeight);
    const { canvas, ctx } = canvasOf(img.naturalWidth * k, img.naturalHeight * k);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      bucket.n++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      buckets.set(key, bucket);
    }
  }

  const sorted = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .map((v) => ({ n: v.n, r: Math.round(v.r / v.n), g: Math.round(v.g / v.n), b: Math.round(v.b / v.n) }));

  // Descarta tons quase iguais a um já escolhido
  const picked: typeof sorted = [];
  for (const c of sorted) {
    const near = picked.some((p) => Math.hypot(p.r - c.r, p.g - c.g, p.b - c.b) < 48);
    if (!near) picked.push(c);
    if (picked.length === count) break;
  }
  return picked.map((c) => `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`.toUpperCase());
}
