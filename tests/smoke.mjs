// Smoke test of the app in the locally installed Chrome: front page, study, mock exam, patterns and review.
// usage: npm test   (opens public/index.html straight from disk; set URL=http://localhost:5173/ to test the server)
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const indexFile = fileURLToPath(new URL('../public/index.html', import.meta.url));
const BASE = process.env.URL || pathToFileURL(indexFile).href;
const CHROME = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => fs.existsSync(p));
const SCREENSHOT_DIR = process.env.SHOTS || null;

const errors = [];
let failures = 0;
const check = (condition, message) => {
  console.log(`${condition ? '✔' : '✖'} ${message}`);
  if (!condition) failures++;
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/fonts\.g/.test(m.text()) && errors.push(m.text()));
await page.setViewport({ width: 1366, height: 1000 });

const visit = async (hash) => {
  await page.goto(BASE + hash, { waitUntil: 'networkidle0' });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 150)));
};
const textOf = (selector) => page.$eval(selector, (e) => e.textContent.trim());
const screenshot = async (name) => SCREENSHOT_DIR && page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: true });

// progress saved by the previous (v1, Portuguese-keyed) storage format is migrated
await visit('#/');
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('gazeta-enade:v1', JSON.stringify({
    v: 1,
    respostas: { '2024-computacao-lic-q30': [{ r: 'B', ok: true, t: Date.now(), m: 'estudo', ms: 1000 }] },
    marcadas: { '2022-formacao-geral-q01': true },
    rascunhos: {}, simulados: [], dataProva: '2026-11-22',
  }));
});
await page.reload({ waitUntil: 'networkidle0' });
check((await textOf('.headline')).includes('primeira questão'), 'legacy progress is migrated (front page counts 1 answer)');
check((await page.$eval('#exam-date', (i) => i.value)) === '22/11/2026', 'legacy exam date is migrated and shown as dd/mm/yyyy');

// exam date field: Brazilian format with automatic slashes, impossible dates rejected
const clearDate = () => page.$eval('#exam-date', (i) => { i.value = ''; i.focus(); });
await clearDate();
await page.type('#exam-date', '05122026');
check((await page.$eval('#exam-date', (i) => i.value)) === '05/12/2026', 'typing digits fills in dd/mm/yyyy');
const stored = await page.waitForFunction(() => JSON.parse(localStorage.getItem('gazeta-enade:v2') || '{}').examDate === '2026-12-05', { timeout: 3000 }).then(() => true, () => false);
check(stored, 'the date is saved, stored as ISO');
await clearDate();
await page.type('#exam-date', '31022026');
await page.$eval('#exam-date', (i) => i.dispatchEvent(new Event('change', { bubbles: true })));
check(!(await page.$eval('#exam-date-error', (p) => p.hidden)), 'an impossible date (31/02) shows an error');
await visit('#/revisao');
check((await page.$$('[data-list="flagged"]')).length === 1, 'legacy flagged question is migrated with its new id');

// start clean
await page.evaluate(() => localStorage.clear());
await visit('#/');
await page.reload({ waitUntil: 'networkidle0' });
check((await textOf('.headline')).includes('questões oficiais'), 'front page shows the initial headline');
check((await page.$$('.listing')).length >= 10, 'front page lists topics in the classifieds');

// study a topic from the front page
await page.click('.listing[data-topic="networks"]');
await page.waitForSelector('.choice');
const firstHash = await page.evaluate(() => location.hash);
check(firstHash.startsWith('#/q/'), 'clicking a topic opens its first question');
check(await page.$eval('.clipping img', (i) => i.complete && i.naturalWidth > 100), 'question clipping loaded');

// answer with the keyboard
await page.keyboard.press('a');
await page.waitForSelector('.stamp');
check(!!(await page.$('.choice.is-correct')), 'after answering, the official answer is highlighted');
await screenshot('question-answered');

// hint
await page.keyboard.press('h');
check(await page.$eval('#hint', (d) => d.open), 'H opens the hint');

// navigation
await page.keyboard.press('ArrowRight');
await page.waitForFunction((prev) => location.hash !== prev, {}, firstHash);
check(true, 'right arrow goes to the next question');

// flag
await page.keyboard.press('m');
check((await textOf('[data-action="flag"]')).includes('Marcada'), 'M flags the question for review');

// filters
await visit('#/estudar');
await page.click('[data-action="clear-filters"]');
await page.evaluate(() => new Promise((r) => setTimeout(r, 150)));
const before = await textOf('.results-header h1');
await page.click('input[data-filter="exams"][value="2023-engenharia-da-computacao"]');
await page.waitForFunction((b) => document.querySelector('.results-header h1').textContent.trim() !== b, {}, before);
check((await textOf('.results-header h1')).startsWith('38'), 'filtering by exam shows the 38 questions from 2023');
await page.type('#search', 'SQL');
await page.waitForFunction(() => !document.querySelector('.results-header h1').textContent.trim().startsWith('38'), { timeout: 3000 });
const sqlCount = parseInt(await textOf('.results-header b'), 10);
check(sqlCount >= 1 && sqlCount < 38, `searching "SQL" narrows the list (${sqlCount} found)`);
await page.click('[data-action="clear-filters"]');

// essay question
await visit('#/q/2023-engenharia-da-computacao-d2');
check(!!(await page.$('#draft')), 'essay question shows a draft area');
await page.type('#draft', 'teste de rascunho');
await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('#draft');
check((await page.$eval('#draft', (t) => t.value)) === 'teste de rascunho', 'draft is saved');

// custom mock exam
await visit('#/simulado');
await page.select('select[name="count"]', '10');
await page.click('[data-action="mock-custom"]');
await page.waitForSelector('#timer');
check(/\d+:\d\d/.test(await textOf('#timer')), 'mock exam shows the timer');
for (let i = 0; i < 10; i++) {
  await page.waitForFunction((n) => document.querySelector('.question-header h1')?.textContent.includes(`Questão ${n} de`), {}, i + 1);
  await page.click('.choice');
  const next = await page.$('[data-action="mock-next"]');
  if (next) await next.click();
}
page.on('dialog', (d) => d.accept());
await page.click('aside [data-action="submit"]');
await page.waitForFunction(() => location.hash.startsWith('#/simulado/resultado/'));
await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
check(/acertos em 10/.test(await textOf('.headline')), 'mock exam report shows 10 questions');
await screenshot('mock-report');

// front page reflects progress
await visit('#/');
check((await textOf('.headline')).startsWith('Você acertou'), 'front page shows the score after answering');

// patterns, review and sources
await visit('#/padroes');
check((await page.$$('.table')).length >= 3, 'patterns page shows its tables');
await visit('#/revisao');
check(!!(await page.$('.headline')), 'review page opens');
await visit('#/fontes');
check((await page.$$('.table tbody tr')).length >= 6, 'sources page lists the exams');

// phone
await page.setViewport({ width: 390, height: 844, isMobile: true });
await visit('#/q/2025-computacao-teaching-q36');
const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
check(scrollWidth <= 390, `no horizontal scroll on a phone (${scrollWidth}px)`);
await screenshot('phone-question');
await visit('#/estudar');
check(!(await page.$eval('#filter-panel', (d) => d.open)), 'filters start collapsed on a phone');
await visit('#/');
await screenshot('phone-front');

check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
process.exit(failures ? 1 : 0);
