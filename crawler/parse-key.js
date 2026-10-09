// Reads INEP's final answer keys ("gabarito definitivo") in three formats:
//  1) list: "QUESTÃO 12  C" (Enade 2022/2023) or a bare "12  C" table (Enade 2017)
//  2) grid: a row of question numbers followed by a row of letters (Enade 2024/2025), one page per booklet
//  3) image only (PND 2025/2026): uses the manual transcription in manual-answer-keys.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPdf, pageRuns, norm } from './pdf.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const manualKeys = JSON.parse(fs.readFileSync(path.join(here, 'manual-answer-keys.json'), 'utf8'));

// a letter, or a mark for an annulled item ("*", "ANULADA", "ANULADO")
const ANSWER = /^([A-E]|\*+|ANULAD[AO])$/;

/** Splits a run holding several tokens ("1 2 3 4") into tokens with an estimated x position. */
function tokens(run) {
  const out = [];
  for (const it of run.items) {
    const parts = it.str.split(/(\s+)/);
    const charWidth = it.w / Math.max(1, it.str.length);
    let offset = 0;
    for (const p of parts) {
      if (p.trim()) out.push({ t: norm(p), cx: it.x + (offset + p.length / 2) * charWidth });
      offset += p.length;
    }
  }
  return out;
}

function groupRows(runs) {
  const rows = [];
  for (const r of [...runs].sort((a, b) => a.baseline - b.baseline)) {
    const row = rows.find((x) => Math.abs(x.baseline - r.baseline) <= 2.5);
    if (row) row.runs.push(r);
    else rows.push({ baseline: r.baseline, runs: [r] });
  }
  for (const row of rows) {
    row.tokens = row.runs.flatMap(tokens).sort((a, b) => a.cx - b.cx);
    row.text = norm(row.runs.sort((a, b) => a.x - b.x).map((r) => r.str).join(' '));
  }
  return rows;
}

function parseList(rows) {
  const answers = {};
  for (const row of rows) {
    const m = row.text.match(/^QUESTAO\s+(\d{1,2})\s+([A-E]|\*+|ANULAD[AO])\b/);
    if (m) answers[+m[1]] = /^[A-E]$/.test(m[2]) ? m[2] : null;
  }
  return answers;
}

// "ITEM | GABARITO" table with one question per row: "12  C"
function parsePairs(rows) {
  const answers = {};
  for (const row of rows) {
    const m = row.text.match(/^(\d{1,2})\s+([A-E]|\*+|ANULAD[AO])$/);
    if (m) answers[+m[1]] = /^[A-E]$/.test(m[2]) ? m[2] : null;
  }
  return answers;
}

function parseGrid(rows) {
  const answers = {};
  const isNumberRow = (row) => row.tokens.length >= 3 && row.tokens.every((t) => /^\d{1,2}$/.test(t.t));
  const numberRows = rows.filter(isNumberRow);
  for (let i = 0; i < numberRows.length; i++) {
    const nr = numberRows[i];
    const nextBaseline = numberRows[i + 1]?.baseline ?? Infinity;
    const below = rows.filter((r) => r.baseline > nr.baseline && r.baseline < nextBaseline && !isNumberRow(r));
    for (const r of below) {
      for (const tk of r.tokens) {
        if (!ANSWER.test(tk.t)) continue;
        const nearest = nr.tokens.reduce((a, b) => (Math.abs(b.cx - tk.cx) < Math.abs(a.cx - tk.cx) ? b : a));
        const q = +nearest.t;
        const value = /^[A-E]$/.test(tk.t) ? tk.t : null;
        // an "ANULADO" printed above the letter wins
        if (!(q in answers) || value === null) answers[q] = value;
      }
    }
  }
  return answers;
}

/**
 * @param file  answer key PDF
 * @param page  page for the booklet in use (keys covering several booklets have one page per booklet)
 * @returns {{ answers: Record<number, string|null>, method: 'manual'|'list'|'grid'|'none', error?: string }}
 *          null means the question was annulled
 */
export async function parseKey(file, page = 1) {
  const name = path.basename(file);
  if (manualKeys[name]) {
    const list = manualKeys[name].answers.trim().split(/\s+/);
    const answers = {};
    list.forEach((a, i) => (answers[i + 1] = a === '*' ? null : a));
    return { answers, method: 'manual' };
  }
  const doc = await openPdf(file);
  const p = await doc.getPage(Math.min(page, doc.numPages));
  const { runs } = await pageRuns(p);
  if (!runs.length) {
    return { answers: {}, method: 'none', error: `answer key ${name} is an image only; add a transcription to crawler/manual-answer-keys.json` };
  }
  const rows = groupRows(runs);
  const list = parseList(rows);
  if (Object.keys(list).length >= 5) return { answers: list, method: 'list' };
  const pairs = parsePairs(rows);
  if (Object.keys(pairs).length >= 5) return { answers: pairs, method: 'list' };
  return { answers: parseGrid(rows), method: 'grid' };
}
