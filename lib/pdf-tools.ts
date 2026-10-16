// Leitura de PDF no navegador: cada página vira uma imagem (JPEG), que segue o mesmo caminho dos posts
// na análise. Assim funciona com qualquer IA e dá para recortar a logo direto do manual.

export interface PdfPage {
  /** JPEG reduzido da página. */
  dataUrl: string;
  /** Número da página (a partir de 1). */
  page: number;
}

export interface PdfPages {
  pages: PdfPage[];
  /** Total de páginas do arquivo (pode ser maior que as lidas). */
  total: number;
}

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export async function renderPdfPages(file: File, maxPages = 12, maxSide = 1280): Promise<PdfPages> {
  // Import dinâmico: o pdf.js usa APIs do navegador e não pode ser carregado no servidor
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;

  try {
    const pages: PdfPage[] = [];
    const count = Math.min(doc.numPages, maxPages);

    for (let i = 1; i <= count; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: maxSide / Math.max(base.width, base.height) });

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('O navegador não conseguiu desenhar a página do PDF.');
      // Páginas com fundo transparente ficam brancas, como no papel
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      pages.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.82), page: i });
      page.cleanup();
    }

    return { pages, total: doc.numPages };
  } finally {
    await task.destroy();
  }
}
