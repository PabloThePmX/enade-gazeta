// Full pipeline: discover tests on INEP's site → download → extract questions → read answer keys →
// classify topics and formats → compute patterns → write public/data/data.js and the crops in public/img.
//
// usage: npm run crawl                    (2014 through the current year)
//        npm run crawl -- --years=2023-2025
//        npm run crawl -- --no-images     (reprocess text/classification only, keep existing crops)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discover, selectExams, download } from './crawl.js';
import { parseExam, splitQuestion, renderBlocks } from './parse-exam.js';
import { parseKey } from './parse-key.js';
import { classify, TOPICS } from './taxonomy.js';
import { detectFormat, isNegativeCommand, computeStats, FORMATS } from './patterns.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = path.join(root, 'data', 'raw');
const PUBLIC_DIR = path.join(root, 'public');
const args = process.argv.slice(2);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? (args.includes(`--${name}`) ? true : null);

const thisYear = new Date().getFullYear();
const [fromYear, toYear] = (option('years') || `2014-${thisYear}`).split('-').map(Number);
const years = [];
for (let y = fromYear; y <= (toYear || fromYear); y++) years.push(y);
const skipImages = !!option('no-images');

// Course names as shown in the interface (Portuguese), keyed by INEP's file-name slug.
const COURSE_NAMES = {
  ciencia_da_computacao: 'Ciência da Computação',
  engenharia_da_computacao: 'Engenharia de Computação',
  sistemas_de_informacao: 'Sistemas de Informação',
  engenharia_de_software: 'Engenharia de Software',
  analise_e_desenvolvimento_de_sistemas: 'Análise e Desenvolvimento de Sistemas',
};
const courseName = (slug) => COURSE_NAMES[slug] || slug.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

const overrides = (() => {
  const f = path.join(root, 'crawler', 'overrides.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
})();

const pad = (n) => String(n).padStart(2, '0');

async function main() {
  console.log(`\n▶ Looking for tests from ${years[0]} to ${years.at(-1)} on INEP's site…`);
  const files = await discover(years);
  const selected = selectExams(files);
  if (!selected.length) throw new Error('No tests found. INEP may have moved its pages.');
  console.log(`\n▶ ${selected.length} tests selected:`);
  for (const e of selected) {
    console.log(`  ${e.year}  ${e.course}`);
  }

  const exams = [];
  const questions = [];
  const sharedTexts = [];
  const warnings = [];

  for (const sel of selected) {
    const examId = `${sel.year}-${sel.course.replace(/_/g, '-')}`;
    console.log(`\n▶ ${examId}`);
    const examPath = await download(sel.exam, RAW_DIR);
    const keyPath = await download(sel.answerKey, RAW_DIR);

    const parsed = await parseExam(examPath);
    const key = await parseKey(keyPath, 1);
    if (key.error) warnings.push(`${examId}: ${key.error}`);

    const blocks = parsed.blocks;
    const objectiveCount = blocks.filter((b) => b.kind === 'objective').length;
    const missingKey = blocks.filter((b) => b.kind === 'objective' && !(b.num in key.answers)).map((b) => b.num);
    if (missingKey.length) warnings.push(`${examId}: no answer for questions ${missingKey.join(', ')}`);

    const imgDir = path.join(PUBLIC_DIR, 'img', examId);
    let images = new Map();
    if (!skipImages) {
      fs.rmSync(imgDir, { recursive: true, force: true });
      fs.mkdirSync(imgDir, { recursive: true });
      images = await renderBlocks(parsed, blocks);
    }

    const optionCounts = [];
    for (const b of blocks) {
      const fileBase = b.kind === 'objective' ? `q${pad(b.num)}` : b.kind === 'essay' ? `d${b.num}` : `t${b.nums.map(pad).join('-')}`;
      const imgPath = `img/${examId}/${fileBase}.webp`;
      const img = images.get(b);
      if (img) fs.writeFileSync(path.join(PUBLIC_DIR, imgPath), await img.canvas.encode('webp', 84));
      const size = img ? { w: img.width, h: img.height } : readWebpSize(path.join(PUBLIC_DIR, imgPath));

      if (b.kind === 'shared') {
        sharedTexts.push({ id: `${examId}-${fileBase}`, examId, nums: b.nums, img: imgPath, ...size, text: b.lines.map((l) => l.text).join('\n') });
        continue;
      }
      const { statement, alternatives } = b.kind === 'objective'
        ? splitQuestion(b.lines)
        : { statement: b.lines.map((l) => l.text).join('\n').replace(/^QUEST\S+ DISCURSIVA\s*\d*\s*/i, ''), alternatives: [] };
      if (b.kind === 'objective') optionCounts.push(alternatives.length);
      const q = {
        id: `${examId}-${fileBase}`,
        examId,
        year: sel.year,
        kind: b.kind, // 'objective' | 'essay'
        num: b.num,
        section: b.section, // 'general' | 'specific'
        page: b.startPage,
        img: imgPath,
        ...size,
        statement: statement.replace(/^QUEST\S+\s+\d+\s*/i, ''),
        alternatives,
        answer: b.kind === 'objective' ? key.answers[b.num] ?? null : null,
        annulled: b.kind === 'objective' && b.num in key.answers && key.answers[b.num] === null,
      };
      const shared = sharedBlocksFor(blocks, b);
      q.sharedTexts = shared.map((s) => `${examId}-t${s.nums.map(pad).join('-')}`);
      // the shared text counts for classification: in 2025/2026 the statement alone is often short
      const fullText = [...shared.flatMap((s) => s.lines.map((l) => l.text)), q.statement, ...alternatives.map((a) => a.text)].join(' ');
      q.topics = classify(fullText, q.section);
      q.format = q.kind === 'objective' ? detectFormat(q) : 'essay';
      q.negative = q.kind === 'objective' && isNegativeCommand(q.statement);
      Object.assign(q, overrides[q.id] || {});
      questions.push(q);
    }

    exams.push({
      id: examId,
      year: sel.year,
      course: sel.course,
      title: courseName(sel.course),
      modality: 'bachelor',
      objectiveCount,
      options: Math.max(...optionCounts),
      booklet: 1,
      keyMethod: key.method, // 'list' | 'grid' | 'manual' | 'none'
      sources: {
        page: sel.exam.page,
        exam: sel.exam.url,
        answerKey: sel.answerKey.url,
        answerGuide: sel.answerGuide?.url || null,
        testMap: sel.testMap?.url || null,
      },
    });
    const count = (kind) => blocks.filter((b) => b.kind === kind).length;
    console.log(`  ${objectiveCount} objective, ${count('essay')} essay, ${count('shared')} shared texts; answer key: ${key.method}`);
  }

  console.log('\n▶ Computing patterns…');
  const data = {
    generatedAt: new Date().toISOString(),
    exams,
    questions,
    sharedTexts,
    patterns: computeStats(questions, exams),
    topics: Object.fromEntries(Object.entries(TOPICS).map(([id, t]) => [id, { label: t.label, group: t.group }])),
    formats: FORMATS,
  };
  fs.mkdirSync(path.join(PUBLIC_DIR, 'data'), { recursive: true });
  fs.writeFileSync(path.join(PUBLIC_DIR, 'data', 'data.js'), '// Generated by crawler/build.js. Do not edit by hand.\nwindow.ENADE = ' + JSON.stringify(data) + ';\n');
  console.log(`\n✔ ${questions.length} questions from ${exams.length} tests written to public/data/data.js`);
  if (warnings.length) {
    console.log('\n⚠ Warnings:');
    for (const w of warnings) console.log('  - ' + w);
  }
}

function sharedBlocksFor(blocks, b) {
  return blocks.filter((s) => s.kind === 'shared' && s.nums.includes(b.num) && b.kind === 'objective');
}

// reads width/height from an existing WebP (used with --no-images)
function readWebpSize(file) {
  if (!fs.existsSync(file)) return {};
  const buf = fs.readFileSync(file);
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  return {};
}

main().catch((e) => {
  console.error('\n✖ ' + (e.stack || e.message));
  process.exit(1);
});
