// Extracts the questions from an Enade/PND test booklet.
// Strategy: locate the "QUESTÃO NN" headers through the positioned text, crop each question's region from
// the rendered page (full fidelity: figures, code and tables stay identical to the original) and extract
// the text only for search, classification and pattern analysis.
import { openPdf, pageRuns, renderPage, inkRows, crop, norm } from './pdf.js';

const SCALE = 2; // crop resolution (2x = ~1150px wide)

// Markers are matched against the booklet's own (Portuguese) wording.
function classifyMarker(run) {
  const n = run.n;
  let m;
  if (/QUESTIONARIO DE PERCEPCAO/.test(n)) return { kind: 'end' };
  if ((m = n.match(/^QUESTAO DISCURSIVA\s*(\d{1,2})?\b/))) return { kind: 'essay', num: m[1] ? +m[1] : null };
  if ((m = n.match(/^QUESTAO\s+(\d{1,2})\b/))) return { kind: 'objective', num: +m[1] };
  if ((m = n.match(/^TEXTO PARA (?:AS )?QUESTO?E?S?\s+(.+)$/)) || (m = n.match(/^TEXTO PARA (?:A )?QUESTAO\s+(.+)$/))) {
    return { kind: 'shared', nums: parseNumList(m[1]) };
  }
  if (/^AREA LIVRE\b/.test(n) || /^RASCUNHO\b/.test(n)) return { kind: 'stop' };
  return null;
}

// "01 e 02" | "de 31 a 33" | "de 02 a 04" | "01, 02 e 03"
export function parseNumList(s) {
  const range = s.match(/(\d{1,2})\s*A\s*(\d{1,2})/);
  if (range) {
    const out = [];
    for (let i = +range[1]; i <= +range[2]; i++) out.push(i);
    return out;
  }
  return (s.match(/\d{1,2}/g) || []).map(Number);
}

/**
 * Some booklets (e.g. 2022) map the font's "ti"/"tt" ligatures to "ti " with a trailing space, producing
 * "democráti co" and "htt ps" in the extracted text. Only fixed when the pattern is frequent in the document.
 * (This affects the search text only; image crops are always identical to the original.)
 */
function fixLigatures(pages) {
  const broken = /([a-zà-ú])(ti|tt|ft) (?=[a-zà-ú])/g;
  const all = pages.flatMap((p) => p.runs.map((r) => r.str)).join('\n');
  const hits = (all.match(broken) || []).length;
  if (hits < pages.length) return;
  for (const p of pages) {
    for (const r of p.runs) {
      r.str = r.str.replace(broken, '$1$2');
      r.n = norm(r.str);
    }
  }
}

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** Finds elements repeated in the footer (page number, section name, watermarks). */
function findFooters(pages) {
  const sig = (r) => r.n.replace(/[\d\s]/g, '').slice(0, 30);
  const counts = new Map();
  for (const p of pages) {
    const seen = new Set();
    for (const r of p.runs) {
      if (r.top < p.height * 0.86) continue;
      const k = sig(r) + '@' + Math.round(r.top / 4);
      if (seen.has(k)) continue;
      seen.add(k);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  const min = Math.max(3, pages.length * 0.25);
  for (const p of pages) {
    const foot = p.runs.filter((r) => r.top >= p.height * 0.86 && (counts.get(sig(r) + '@' + Math.round(r.top / 4)) || 0) >= min);
    p.footerTop = foot.length ? Math.min(...foot.map((r) => r.top)) - 3 : p.height * 0.93;
    p.footerText = foot.map((r) => r.str).join(' ');
  }
}

/**
 * Reads the cover table ("Componente Específico: Objetivas 09 a 35", "Componente Específico: Discursivas D3 a D5")
 * to find where the specific component starts.
 */
function coverRanges(runs) {
  const text = runs.map((r) => r.n).join(' ');
  const specific = text.match(/COMPONENTE ESPECIFICO(?: DA AREA)?:?\s*OBJETIVAS\s+(\d{1,2})\s*A\s*(\d{1,2})/);
  const specificEssays = text.match(/COMPONENTE ESPECIFICO(?: DA AREA)?:?\s*DISCURSIVAS?\s+D(\d)(?:\s*A\s*D(\d))?/);
  if (!specific) return null;
  const essayNums = [];
  if (specificEssays) for (let i = +specificEssays[1]; i <= +(specificEssays[2] || specificEssays[1]); i++) essayNums.push(i);
  return { specificFrom: +specific[1], specificTo: +specific[2], specificEssays: essayNums };
}

export async function parseExam(file) {
  const doc = await openPdf(file);
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const info = await pageRuns(page);
    pages.push({ num: i, ...info });
  }
  fixLigatures(pages);
  findFooters(pages);
  const cover = coverRanges(pages[0].runs);

  const bodyH = median(pages.flatMap((p) => p.runs.map((r) => r.h)));

  // markers per page
  for (const p of pages) {
    p.markers = [];
    for (const r of p.runs) {
      if (r.top >= p.footerTop) continue;
      const m = classifyMarker(r);
      if (!m) continue;
      if (m.kind !== 'stop' && m.kind !== 'end' && r.h < bodyH * 0.95) continue;
      p.markers.push({ ...m, x: r.x, top: r.top, run: r });
    }
  }
  const qMarkers = pages.flatMap((p) => p.markers.filter((m) => m.kind !== 'stop' && m.kind !== 'end'));
  if (!qMarkers.length) throw new Error('no questions found in ' + file);
  const leftMargin = Math.min(...qMarkers.map((m) => m.x)) - 8;
  const contentTop = Math.min(...qMarkers.map((m) => m.top)) - 4;

  // build blocks in reading order
  const blocks = [];
  let current = null;
  let ended = false;
  const firstPage = pages.find((p) => p.markers.some((m) => ['objective', 'essay', 'shared'].includes(m.kind))).num;

  for (const p of pages) {
    if (ended || p.num < firstPage) continue;
    const right = p.width - leftMargin;
    const rightMarkers = p.markers.filter((m) => m.kind !== 'stop' && m.kind !== 'end' && m.x > p.width * 0.4);
    const split = rightMarkers.length ? Math.min(...rightMarkers.map((m) => m.x)) - 8 : null;
    const cols = split ? [[leftMargin, split], [split, right]] : [[leftMargin, right]];
    const bottom = p.footerTop;

    for (const [x0, x1] of cols) {
      const inCol = (m) => (split ? m.x >= x0 - 2 && m.x < x1 - 20 : true);
      const ms = p.markers.filter(inCol).sort((a, b) => a.top - b.top);
      let y = contentTop;
      const pushSeg = (y0, y1) => {
        if (!current || y1 - y0 < 4) return;
        current.segs.push({ page: p.num, x0, x1, y0, y1 });
      };
      for (const m of ms) {
        pushSeg(y, m.top - 2);
        y = m.top - 2;
        if (m.kind === 'end') { current = null; ended = true; break; }
        if (m.kind === 'stop') { current = null; continue; }
        current = { kind: m.kind, num: m.num ?? null, nums: m.nums ?? null, startPage: p.num, segs: [] };
        blocks.push(current);
      }
      if (ended) break;
      pushSeg(y, bottom);
    }
  }

  // number the essay questions that have no number
  let essayCount = 0;
  for (const b of blocks) if (b.kind === 'essay') b.num = b.num ?? ++essayCount;

  // General education ("Formação Geral") vs. specific component ("Componente Específico"):
  // 1) footers saying "FORMAÇÃO GERAL" (when the booklet labels each page);
  // 2) otherwise the cover table; 3) shared texts follow the first question they serve.
  const footersMarkGeneral = pages.some((p) => norm(p.footerText).replace(/\s/g, '').includes('FORMACAOGERAL'));
  for (const b of blocks) {
    if (footersMarkGeneral) {
      const f = norm(pages[b.startPage - 1].footerText).replace(/\s/g, '');
      b.section = f.includes('FORMACAOGERAL') ? 'general' : 'specific';
    } else if (cover) {
      if (b.kind === 'objective') b.section = b.num >= cover.specificFrom ? 'specific' : 'general';
      else if (b.kind === 'essay') b.section = cover.specificEssays.includes(b.num) ? 'specific' : 'general';
      else b.section = Math.min(...b.nums) >= cover.specificFrom ? 'specific' : 'general';
    } else {
      b.section = 'specific';
    }
  }

  // text of each block
  for (const b of blocks) {
    const runs = [];
    for (const s of b.segs) {
      const p = pages[s.page - 1];
      for (const r of p.runs) {
        const cx = r.x + Math.min(r.w, 20) / 2;
        if (r.top >= s.y0 - 1 && r.bottom <= s.y1 + 2 && cx >= s.x0 && cx < s.x1) runs.push({ ...r, page: s.page });
      }
    }
    b.lines = toLines(runs);
  }

  return { doc, pages, blocks, cover, bodyH };
}

function toLines(runs) {
  const lines = [];
  for (const r of runs) {
    const l = lines.find((l) => l.page === r.page && Math.abs(l.baseline - r.baseline) <= 2 && Math.abs(l.colX - r.x) < 400);
    if (l && r.x > l.x - 300) l.runs.push(r);
    else lines.push({ page: r.page, baseline: r.baseline, colX: r.x, runs: [r] });
  }
  for (const l of lines) {
    l.runs.sort((a, b) => a.x - b.x);
    l.x = l.runs[0].x;
    l.text = l.runs.map((r) => r.str).join(' ').replace(/\s+/g, ' ').trim();
  }
  return lines; // already in reading order (runs arrive sorted by segment)
}

/** Splits the statement from the alternatives (A–E) using the text lines. */
export function splitQuestion(lines) {
  const body = lines.filter((l, i) => !(i === 0 && /^QUEST/i.test(norm(l.text))));
  const letters = ['A', 'B', 'C', 'D', 'E'];
  const starts = body.map((l) => {
    const m = l.text.match(/^([A-E])(?:\s+|$)(.*)$/);
    return m ? m[1] : null;
  });
  // find the last A, B, C, D(, E) sequence in order
  let best = null;
  for (let i = body.length - 1; i >= 0; i--) {
    if (starts[i] !== 'A') continue;
    const idx = [i];
    let k = 1;
    for (let j = i + 1; j < body.length && k < 5; j++) if (starts[j] === letters[k]) { idx.push(j); k++; }
    if (idx.length >= 4) { best = idx; break; }
  }
  if (!best) return { statement: body.map((l) => l.text).join('\n'), alternatives: [] };
  const alternatives = best.map((li, n) => {
    const end = best[n + 1] ?? body.length;
    const first = body[li].text.replace(/^[A-E]\s*/, '');
    const rest = body.slice(li + 1, end).map((l) => l.text);
    return { letter: letters[n], text: [first, ...rest].join(' ').replace(/\s+/g, ' ').trim() };
  });
  return { statement: body.slice(0, best[0]).map((l) => l.text).join('\n'), alternatives };
}

/**
 * Vertical range that holds content. Ignores small specks (dots, watermarks) isolated far from the
 * content, which would otherwise leave a large blank band in the crop.
 */
function contentRange(rows) {
  const groups = [];
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i]) continue;
    const g = groups[groups.length - 1];
    if (g && i - g.end <= 1) g.end = i;
    else groups.push({ start: i, end: i });
  }
  const tiny = (g) => g.end - g.start < 10;
  const GAP = 80;
  while (groups.length > 1 && tiny(groups.at(-1)) && groups.at(-1).start - groups.at(-2).end > GAP) groups.pop();
  while (groups.length > 1 && tiny(groups[0]) && groups[1].start - groups[0].end > GAP) groups.shift();
  if (!groups.length) return { first: -1, last: -1 };
  return { first: groups[0].start, last: groups.at(-1).end };
}

/** Renders each block as a single image (segments stacked), trimming blank edges. */
export async function renderBlocks(parsed, blocks) {
  const { doc } = parsed;
  const cache = new Map();
  const getCanvas = async (num) => {
    if (!cache.has(num)) {
      if (cache.size > 3) cache.delete(cache.keys().next().value);
      cache.set(num, await renderPage(await doc.getPage(num), SCALE));
    }
    return cache.get(num);
  };
  const { createCanvas } = await import('@napi-rs/canvas');
  const results = new Map();
  for (const b of blocks) {
    const parts = [];
    for (const s of b.segs) {
      const canvas = await getCanvas(s.page);
      const X0 = s.x0 * SCALE, X1 = s.x1 * SCALE;
      const Y0 = Math.max(0, s.y0 * SCALE), Y1 = Math.min(canvas.height, s.y1 * SCALE);
      const rows = inkRows(canvas, X0, X1, Y0, Y1);
      const { first, last } = contentRange(rows);
      if (first < 0) continue;
      const pad = 6;
      const top = Math.max(0, first - pad), bot = Math.min(rows.length, last + pad);
      parts.push(crop(canvas, X0, Y0 + top, X1 - X0, bot - top));
    }
    if (!parts.length) continue;
    const gap = 18;
    const W = Math.max(...parts.map((c) => c.width));
    const H = parts.reduce((s, c) => s + c.height, 0) + gap * (parts.length - 1);
    const out = createCanvas(W, H);
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    let y = 0;
    parts.forEach((c, i) => {
      ctx.drawImage(c, 0, y);
      y += c.height;
      if (i < parts.length - 1) {
        // dotted rule marks a page/column break in the original
        ctx.strokeStyle = '#c9c2b4';
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(10, y + gap / 2);
        ctx.lineTo(W - 10, y + gap / 2);
        ctx.stroke();
        y += gap;
      }
    });
    results.set(b, { canvas: out, width: W, height: H });
  }
  return results;
}
