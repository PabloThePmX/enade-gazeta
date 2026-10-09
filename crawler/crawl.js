// Discovers tests and answer keys on INEP's official pages and downloads the PDFs we need.
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais';

// INEP has reorganized its site a few times; each year may live in either of these sections.
// Teaching degrees ("licenciaturas") are out of scope, so their section is not crawled.
export const SECTIONS = ['enade', 'enade-bacharelado-e-superiores-de-tecnologia'];

// The only courses we keep: the bachelor's computing courses and the Análise e Desenvolvimento de Sistemas
// technology degree. Each pattern covers every spelling INEP has used in file names
// (e.g. 2017 booklet "03_CIE_COM_BACHAREL_BAIXA" vs. its answer key "03_Ciencia_da_Computacao_Bacharelado";
// in 2014 Ciência da Computação is just "03_computacao_bacharelado").
export const COMPUTING_COURSES = [
  { slug: 'ciencia_da_computacao', pattern: /ciencias?_(da_)?computacao|cie_com(_|$)|^(\d+_)?(gab_)?computacao_bacharel/ },
  { slug: 'engenharia_da_computacao', pattern: /engenharia_(da_|de_)?computacao|eng_com(_|$)/ },
  { slug: 'sistemas_de_informacao', pattern: /sistemas?_(de_)?informacao|sis_informacao/ },
  { slug: 'engenharia_de_software', pattern: /engenharia_(de_)?software|eng_sof(_|$)/ },
  { slug: 'analise_e_desenvolvimento_de_sistemas', pattern: /analise_(e_)?desenv(olvimento)?_(de_)?sistemas|ana_des_sis|desenvolvimento_(de_)?sistemas/ },
];

// accessibility editions of the same booklet (screen reader, large print, ...)
const VARIANT = /ledor|ampliada|super|braille|nvda|libras|video|_ac_|transcri/i;
const TEACHING_DEGREE = /licenciatura|(^|_)lic(_|$)/;

const HEADERS = { 'User-Agent': 'enade-gazeta/1.0 (personal study tool)' };

// INEP's servers drop connections now and then; retry a few times with a growing pause.
async function fetchWithRetry(url, attempts = 4) {
  for (let i = 1; ; i++) {
    try {
      return await fetch(url, { headers: HEADERS, redirect: 'follow' });
    } catch (e) {
      if (i >= attempts) throw new Error(`${e.cause?.code || e.message} for ${url}`);
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
}

async function fetchText(url) {
  const res = await fetchWithRetry(url);
  if (!res.ok) return null;
  return res.text();
}

/**
 * Classifies an INEP PDF link.
 * Since 2021 the type is a token in the file name: PV = test booklet ("prova"), GB = answer key ("gabarito"),
 * MP = test map ("mapa"), "discursiva" = essay answer guide. Up to 2019 each type has its own folder:
 * /provas/<year>/, /gabaritos/<year>/ and /padrao_resposta/<year>/.
 */
export function describeFile(url, year) {
  const file = decodeURIComponent(url.split('/').pop());
  const name = file.replace(/\.pdf$/i, '').toLowerCase();
  const folderScheme = new RegExp(`/(provas|gabaritos|padrao_resposta)/${year}/`, 'i').exec(url);
  if (!folderScheme && !name.startsWith(String(year))) return null;
  if (VARIANT.test(name)) return null;

  let type = null;
  if (folderScheme) type = { provas: 'exam', gabaritos: 'answerKey', padrao_resposta: 'answerGuide' }[folderScheme[1].toLowerCase()];
  else if (/padrao_resposta/i.test(url) || /(^|_)discursiva(_|$)/.test(name)) type = 'answerGuide';
  else if (/(^|_)pv(_|$)/.test(name)) type = 'exam';
  else if (/(^|_)gb(_|$)/.test(name)) type = 'answerKey';
  else if (/(^|_)mp(_|$)/.test(name)) type = 'testMap';
  if (!type) return null;

  const range = name.match(/_(?:pv|gb)_(\d+)_a_(\d+)/);
  const single = name.match(/_(?:pv|gb)_(\d+)(?:_|$)/);
  const booklet = range ? null : single ? +single[1] : 1;

  const computing = COMPUTING_COURSES.find((c) => c.pattern.test(name));
  const course = computing ? computing.slug : name
    .replace(new RegExp('^' + year + '_'), '')
    .replace(/(^|_)(padrao_resposta|pad_resp)(?=_|$)/g, '')
    .replace(/(^|_)(pv|gb|gab|mp|discursiva|cst|baixa|alta|bacharel|bacharelado)(?=_|$)/g, '')
    .replace(/_\d+_a_\d+$/, '')
    .replace(/(^|_)\d+(?=_|$)/g, '')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  const modality = TEACHING_DEGREE.test(name) ? 'teaching' : 'bachelor';
  return { url, file, type, booklet, bookletRange: range ? [+range[1], +range[2]] : null, course, computing: !!computing, modality };
}

/** Lists every PDF published for the given years, across all known sections. */
export async function discover(years, log = console.log) {
  const found = [];
  for (const year of years) {
    for (const section of SECTIONS) {
      const url = `${BASE}/${section}/provas-e-gabaritos/${year}`;
      let html = null;
      try {
        html = await fetchText(url);
      } catch (e) {
        log(`  ! ${url}: ${e.message}`);
      }
      if (!html) continue;
      const links = [...new Set(html.match(/https?:\/\/download\.inep\.gov\.br\/[^"'\s<>]+?\.pdf/gi) || [])];
      log(`  ${year} ${section}: ${links.length} PDFs`);
      for (const link of links) {
        const d = describeFile(link, year);
        if (d) found.push({ ...d, year, page: url });
      }
    }
  }
  return found;
}

/** Groups files into exams (year + course) and picks booklet 1, answer key, answer guide and test map. */
export function selectExams(files) {
  const byKey = new Map();
  for (const f of files.filter((f) => f.modality === 'bachelor')) {
    const key = `${f.year}|${f.course}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(f);
  }
  const groups = [...byKey.entries()].map(([key, list]) => {
    const [year, course] = key.split('|');
    const pick = (type) => {
      const l = list.filter((f) => f.type === type);
      return l.find((f) => f.booklet === 1) || l.find((f) => f.bookletRange?.[0] === 1) || l[0] || null;
    };
    return {
      year: +year, course, computing: list[0].computing, modality: 'bachelor',
      exam: pick('exam'), answerKey: pick('answerKey'), answerGuide: pick('answerGuide'), testMap: pick('testMap'),
    };
  });

  // only computing tests; years without one (e.g. 2015, 2016, 2018) contribute nothing
  return groups
    .filter((g) => g.computing && g.exam && g.answerKey)
    .sort((a, b) => a.year - b.year || a.course.localeCompare(b.course))
    .map((g) => ({ ...g, scope: 'full' }));
}

export async function download(file, dir, log = console.log) {
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${file.year}_${file.type}_${file.file}`.replace(/^(\d{4})_\w+_\1_/, '$1_'));
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return dest;
  log(`  ↓ ${file.url}`);
  const res = await fetchWithRetry(file.url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${file.url}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}
