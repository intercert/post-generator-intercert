// Copia o worker do pdf.js para public/, para o navegador carregá-lo sem depender do bundler.
// Roda no postinstall, assim a versão do worker sempre acompanha a da biblioteca instalada.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';

const source = 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs';
if (!existsSync(source)) {
  console.warn('pdf.js não encontrado; o worker não foi copiado.');
  process.exit(0);
}
mkdirSync('public', { recursive: true });
copyFileSync(source, 'public/pdf.worker.min.mjs');
