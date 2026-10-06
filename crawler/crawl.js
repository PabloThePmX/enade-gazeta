// Discovers tests and answer keys on INEP's official pages and downloads the PDFs we need.
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais';

// INEP has reorganized its site a few times; each year may live in any of these sections.
export const SECTIONS = [
  { slug: 'enade', modality: 'bachelor' },
  { slug: 'enade-bacharelado-e-superiores-de-tecnologia', modality: 'bachelor' },
  { slug: 'enade-das-licenciaturas', modality: 'teaching' },
];

// Computing courses, matched against INEP's file names (no accents)
export const COMPUTING = /comput|informatica|software|sistemas_de_informacao|analise_e_desenvolvimento|redes_de_computadores|ciencia_de_dados|seguranca_da_informacao|jogos_digitais|tecnologia_da_informacao/i;

// Course used as the source of the bachelor's general-education section in years without a computing test
// (general education is the same for every bachelor's course in a given year).
export const GENERAL_EDUCATION_SOURCE = ['administracao', 'direito', 'psicologia'];

// accessibility editions of the same booklet (screen reader, large print, ...)
const VARIANT = /ledor|ampliada|super|braille|nvda|libras|video|_ac_|transcri/i;

const HEADERS = { 'User-Agent': 'enade-gazeta/1.0 (personal study tool)' };

async function fetchText(url) {
  const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
  if (!res.ok) return null;
  return res.text();
}

/**
 * Classifies an INEP PDF link by its file name.
 * INEP's prefixes: PV = test booklet ("prova"), GB = answer key ("gabarito"), MP = test map ("mapa"),
 * padrao_resposta / discursiva = essay answer guide.
 */
export function describeFile(url, year) {
  const file = decodeURIComponent(url.split('/').pop());
  const name = file.replace(/\.pdf$/i, '').toLowerCase();
  if (!name.startsWith(String(year))) return null;
  if (VARIANT.test(name)) return null;
  let type = null;
  if (/padrao_resposta/i.test(url) || /(^|_)discursiva(_|$)/.test(name)) type = 'answerGuide';
  else if (/(^|_)pv(_|$)/.test(name)) type = 'exam';
  else if (/(^|_)gb(_|$)/.test(name)) type = 'answerKey';
  else if (/(^|_)mp(_|$)/.test(name)) type = 'testMap';
  if (!type) return null;

  const range = name.match(/_(?:pv|gb)_(\d+)_a_(\d+)/);
  const single = name.match(/_(?:pv|gb)_(\d+)(?:_|$)/);
  const booklet = range ? null : single ? +single[1] : 1;

  const course = name
    .replace(new RegExp('^' + year + '_'), '')
    .replace(/(^|_)(pv|gb|mp|discursiva|cst)(?=_|$)/g, '')
    .replace(/_\d+_a_\d+$/, '')
    .replace(/(^|_)\d+(?=_|$)/g, '')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  return { url, file, type, booklet, bookletRange: range ? [+range[1], +range[2]] : null, course };
}

/** Lists every PDF published for the given years, across all known sections. */
export async function discover(years, log = console.log) {
  const found = [];
  for (const year of years) {
    for (const section of SECTIONS) {
      const url = `${BASE}/${section.slug}/provas-e-gabaritos/${year}`;
      let html = null;
      try {
        html = await fetchText(url);
      } catch (e) {
        log(`  ! ${url}: ${e.message}`);
      }
      if (!html) continue;
      const links = [...new Set(html.match(/https?:\/\/download\.inep\.gov\.br\/[^"'\s<>]+?\.pdf/gi) || [])];
      log(`  ${year} ${section.slug}: ${links.length} PDFs`);
      for (const link of links) {
        const d = describeFile(link, year);
        if (d) found.push({ ...d, year, modality: section.modality, page: url });
      }
    }
  }
  return found;
}

/** Groups files into exams (year + course) and picks booklet 1, answer key, answer guide and test map. */
export function selectExams(files) {
  const byKey = new Map();
  for (const f of files) {
    const key = `${f.year}|${f.modality}|${f.course}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(f);
  }
  const groups = [...byKey.entries()].map(([key, list]) => {
    const [year, modality, course] = key.split('|');
    const pick = (type) => {
      const l = list.filter((f) => f.type === type);
      return l.find((f) => f.booklet === 1) || l.find((f) => f.bookletRange?.[0] === 1) || l[0] || null;
    };
    return { year: +year, modality, course, exam: pick('exam'), answerKey: pick('answerKey'), answerGuide: pick('answerGuide'), testMap: pick('testMap') };
  });

  const exams = [];
  const years = [...new Set(groups.map((g) => g.year))].sort();
  for (const year of years) {
    const ofYear = groups.filter((g) => g.year === year && g.exam && g.answerKey);
    const computing = ofYear.filter((g) => COMPUTING.test(g.course));
    for (const g of computing) exams.push({ ...g, scope: 'full' });
    const hasComputingBachelor = computing.some((g) => g.modality === 'bachelor');
    const bachelors = ofYear.filter((g) => g.modality === 'bachelor' && !COMPUTING.test(g.course));
    if (!hasComputingBachelor && bachelors.length) {
      const source = GENERAL_EDUCATION_SOURCE.map((c) => bachelors.find((g) => g.course === c)).find(Boolean) || bachelors[0];
      exams.push({ ...source, scope: 'general-education' });
    }
  }
  return exams;
}

export async function download(file, dir, log = console.log) {
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, file.file);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return dest;
  log(`  â†“ ${file.url}`);
  const res = await fetch(file.url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${file.url}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}
