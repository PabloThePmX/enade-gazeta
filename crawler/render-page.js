// Utility: renders PDF pages to PNG (handy for checking answer keys that are images only).
// usage: node crawler/render-page.js file.pdf output-dir [scale] [pages: 1,2,5]
import fs from 'node:fs';
import path from 'node:path';
import { openPdf, renderPage } from './pdf.js';

const [file, outDir, scaleArg = '2', pagesArg] = process.argv.slice(2);
if (!file || !outDir) {
  console.error('usage: node crawler/render-page.js file.pdf output-dir [scale] [pages]');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const doc = await openPdf(file);
const pages = pagesArg ? pagesArg.split(',').map(Number) : [...Array(doc.numPages)].map((_, i) => i + 1);
for (const p of pages) {
  const canvas = await renderPage(await doc.getPage(p), Number(scaleArg));
  const out = path.join(outDir, `${path.basename(file, '.pdf')}_p${p}.png`);
  fs.writeFileSync(out, await canvas.encode('png'));
  console.log(out);
}
