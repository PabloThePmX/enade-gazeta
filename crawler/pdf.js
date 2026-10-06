// PDF access: positioned text (to locate questions) and rendering (for faithful image crops).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// pdf.js resources: wasm decoders (JPEG2000/JBIG2), standard fonts and character maps
const pdfjsDir = path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
const dirUrl = (d) => path.join(pdfjsDir, d).replace(/\\/g, '/') + '/';

export async function openPdf(file) {
  const data = new Uint8Array(fs.readFileSync(file));
  return getDocument({
    data,
    verbosity: 0,
    useSystemFonts: false,
    wasmUrl: dirUrl('wasm'),
    standardFontDataUrl: dirUrl('standard_fonts'),
    cMapUrl: dirUrl('cmaps'),
    cMapPacked: true,
    iccUrl: dirUrl('iccs'),
  }).promise;
}

// Strips accents and normalizes whitespace/case so markers can be compared ("QUeSTÃo 08" -> "QUESTAO 08").
export function norm(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * Reads a page's text items and groups them into "runs": contiguous pieces on the same baseline.
 * Coordinates are converted to a top-down system (top = 0 at the top of the page).
 */
export async function pageRuns(page) {
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const items = tc.items
    .filter((it) => it.str && it.str.trim())
    .map((it) => {
      const h = Math.abs(it.transform[3]) || it.height || 10;
      // convert from PDF space to rendered-page space (accounts for a shifted media box)
      const [x, baseline] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
      return { x, w: it.width, h, baseline, str: it.str };
    })
    .sort((a, b) => a.baseline - b.baseline || a.x - b.x);

  // group by baseline (2pt tolerance)
  const lines = [];
  for (const it of items) {
    const line = lines.find((l) => Math.abs(l.baseline - it.baseline) <= 2);
    if (line) line.items.push(it);
    else lines.push({ baseline: it.baseline, items: [it] });
  }

  const runs = [];
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    let cur = null;
    for (const it of line.items) {
      const gap = cur ? it.x - (cur.x + cur.w) : Infinity;
      // short threshold: merges across word spaces but not across the gutter between columns
      if (cur && gap < Math.max(3, it.h * 0.7)) {
        cur.items.push(it);
        cur.w = it.x + it.w - cur.x;
        cur.h = Math.max(cur.h, it.h);
      } else {
        cur = { x: it.x, w: it.w, h: it.h, baseline: line.baseline, items: [it] };
        runs.push(cur);
      }
    }
  }
  for (const r of runs) {
    r.str = joinItems(r.items);
    r.top = r.baseline - r.h * 0.9;
    r.bottom = r.baseline + r.h * 0.25;
    r.n = norm(r.str);
  }
  return { width: vp.width, height: vp.height, runs };
}

/** Joins the text items of one line, inserting a space only where there is a visible gap. */
export function joinItems(items) {
  let s = '';
  let prevEnd = null;
  for (const it of [...items].sort((a, b) => a.x - b.x)) {
    if (prevEnd !== null && it.x - prevEnd > it.h * 0.15 && !s.endsWith(' ') && !it.str.startsWith(' ')) s += ' ';
    s += it.str;
    prevEnd = it.x + it.w;
  }
  return s.replace(/\s+/g, ' ').trim();
}

export async function renderPage(page, scale) {
  const vp = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, canvas, viewport: vp }).promise;
  return canvas;
}

/** For each pixel row in [y0, y1) (canvas px), whether it has any non-white pixel within [x0, x1). */
export function inkRows(canvas, x0, x1, y0, y1) {
  const ctx = canvas.getContext('2d');
  const w = Math.max(1, Math.floor(x1 - x0));
  const h = Math.max(1, Math.floor(y1 - y0));
  const img = ctx.getImageData(Math.floor(x0), Math.floor(y0), w, h).data;
  const rows = new Array(h).fill(false);
  for (let y = 0; y < h; y++) {
    const off = y * w * 4;
    for (let x = 0; x < w; x++) {
      const i = off + x * 4;
      if (img[i] < 225 || img[i + 1] < 225 || img[i + 2] < 225) { rows[y] = true; break; }
    }
  }
  return rows;
}

export function crop(canvas, x, y, w, h) {
  const out = createCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, Math.round(x), Math.round(y), Math.round(w), Math.round(h), 0, 0, Math.round(w), Math.round(h));
  return out;
}
