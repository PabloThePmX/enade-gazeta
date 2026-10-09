/* Enade Gazeta: study app. A classic (non-module) script, so it also works when index.html is
   opened straight from disk. Code is in English; every user-facing string is in Portuguese. */
(function () {
  'use strict';

  const DATA = window.ENADE;
  const main = document.getElementById('content');

  if (!DATA || !DATA.questions) {
    main.innerHTML = `<section class="no-data prose"><p class="kicker">Edição sem conteúdo</p>
      <h1 class="headline">Ainda não há provas baixadas</h1>
      <p class="dek">Rode <code>npm install</code> e depois <code>npm run crawl</code> na pasta do projeto. O crawler busca as provas no site do Inep e gera os dados deste site.</p></section>`;
    return;
  }

  // ------------------------------------------------------------------ utilities

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const fmtNum = (n) => n.toLocaleString('pt-BR');
  const fmtDecimal = (n) => n.toLocaleString('pt-BR');
  const plural = (n, one, many) => `${fmtNum(n)} ${n === 1 ? one : many}`;
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const fmtDuration = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(ss).padStart(2, '0');
  };
  const longDate = (d) => d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const shortDate = (t) => new Date(t).toLocaleDateString('pt-BR');
  const shortTime = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // Dates are stored as ISO (yyyy-mm-dd) and always shown in the Brazilian format (dd/mm/yyyy),
  // whatever the browser's language. A native <input type="date"> would follow the browser locale.
  const isoToBr = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
  function brToIso(text) {
    const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const [, dd, mm, yyyy] = m;
    const d = new Date(Date.UTC(+yyyy, +mm - 1, +dd));
    // rejects impossible dates such as 31/02/2026
    if (d.getUTCFullYear() !== +yyyy || d.getUTCMonth() !== +mm - 1 || d.getUTCDate() !== +dd) return null;
    return `${yyyy}-${mm}-${dd}`;
  }
  /** Keeps only digits and inserts the slashes while the user types: "22112026" -> "22/11/2026". */
  const maskBrDate = (text) => {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/');
  };

  // ------------------------------------------------------------------ derived data

  const questions = DATA.questions;
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const exams = DATA.exams;
  const examById = new Map(exams.map((e) => [e.id, e]));
  const sharedTextById = new Map(DATA.sharedTexts.map((t) => [t.id, t]));
  const P = DATA.patterns;
  const objectives = questions.filter((q) => q.kind === 'objective' && !q.annulled);

  const topicLabel = (id) => DATA.topics[id]?.label || id;
  const formatLabel = (id) => DATA.formats[id] || 'Discursiva';
  const examName = (e) => e.title;
  const examFullName = (e) => `${examName(e)} (${e.year})`;
  const examSubtitle = () => 'Bacharelado';
  const examShortLabel = (e) => ({ ciencia_da_computacao: 'CC', engenharia_da_computacao: 'EC', sistemas_de_informacao: 'SI', analise_e_desenvolvimento_de_sistemas: 'ADS', engenharia_de_software: 'ES' }[e.course] || e.title);
  const questionLabel = (q) => (q.kind === 'essay' ? `Discursiva ${q.num}` : `Questão ${String(q.num).padStart(2, '0')}`);
  const sectionLabel = (s) => (s === 'general' ? 'Formação Geral' : 'Componente Específico');
  const KEY_METHOD_LABELS = {
    list: 'lido do PDF (lista)',
    grid: 'lido do PDF (grade)',
    manual: 'transcrição manual (gabarito publicado como imagem)',
    none: 'indisponível',
  };

  // ------------------------------------------------------------------ local storage

  const STORAGE_KEY = 'gazeta-enade:v2';
  const LEGACY_KEY = 'gazeta-enade:v1';
  const emptyState = () => ({
    version: 2,
    attempts: {}, // questionId -> [{ choice, ok, at, mode: 'study' | 'mock', ms }]
    flagged: {}, // questionId -> true
    drafts: {}, // questionId -> essay draft text
    mockExams: [], // finished mock exams
    session: null, // { ids, idx, origin }
    currentMock: null, // mock exam in progress
    filters: null,
    examDate: '',
  });

  // v1 stored Portuguese keys and older question ids; carry the progress over.
  function migrateLegacy(old) {
    const renameId = (id) => id.replace('-formacao-geral-', '-general-education-').replace(/-lic-/, '-teaching-');
    const renameKeys = (obj) => Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [renameId(k), v]));
    const state = emptyState();
    for (const [id, list] of Object.entries(old.respostas || {})) {
      state.attempts[renameId(id)] = list.map((r) => ({ choice: r.r, ok: r.ok, at: r.t, mode: r.m === 'simulado' ? 'mock' : 'study', ms: r.ms }));
    }
    state.flagged = renameKeys(old.marcadas);
    state.drafts = renameKeys(old.rascunhos);
    state.mockExams = (old.simulados || []).map((s) => ({
      id: s.id, at: s.t, title: s.titulo, ids: s.ids.map(renameId), choices: renameKeys(s.respostas),
      duration: s.dur, limit: s.limite, correct: s.acertos, total: s.total,
    }));
    state.examDate = old.dataProva || '';
    return state;
  }

  let state = (() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return Object.assign(emptyState(), JSON.parse(raw));
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) return migrateLegacy(JSON.parse(legacy));
    } catch (e) { /* unreadable storage: start fresh */ }
    return emptyState();
  })();

  let saveTimer = null;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        localStorage.removeItem(LEGACY_KEY);
      } catch (e) { /* storage unavailable: keep progress in memory only */ }
    }, 120);
  };

  const lastAttempt = (id) => {
    const list = state.attempts[id];
    return list && list.length ? list[list.length - 1] : null;
  };
  /** 'new' | 'right' | 'wrong' | 'answered' (annulled questions have no right/wrong) */
  const statusOf = (id) => {
    const last = lastAttempt(id);
    if (!last) return 'new';
    if (last.ok === true) return 'right';
    if (last.ok === false) return 'wrong';
    return 'answered';
  };
  function recordAttempt(q, choice, mode, ms) {
    const ok = q.annulled || !q.answer ? null : choice === q.answer;
    (state.attempts[q.id] = state.attempts[q.id] || []).push({ choice, ok, at: Date.now(), mode, ms: ms || null });
    save();
    return ok;
  }

  function myStats() {
    let answered = 0, right = 0;
    const days = new Set();
    const byTopic = {}, byFormat = {};
    const bump = (map, key, ok) => {
      map[key] = map[key] || { n: 0, ok: 0 };
      map[key].n++;
      if (ok) map[key].ok++;
    };
    for (const [id, list] of Object.entries(state.attempts)) {
      const q = questionById.get(id);
      if (!q || !list.length) continue;
      list.forEach((a) => days.add(new Date(a.at).toISOString().slice(0, 10)));
      const last = list[list.length - 1];
      if (last.ok === null) continue;
      answered++;
      if (last.ok) right++;
      for (const t of q.topics) bump(byTopic, t, last.ok);
      bump(byFormat, q.format, last.ok);
    }
    return { answered, right, days: days.size, byTopic, byFormat };
  }

  // ------------------------------------------------------------------ filters

  const defaultFilters = () => ({ exams: [], sections: [], topics: [], formats: [], status: 'all', kind: 'objective', search: '', order: 'exam' });
  if (!state.filters) state.filters = defaultFilters();

  const normalizeSearch = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const searchText = new Map(questions.map((q) => [q.id, normalizeSearch([
    q.statement, ...q.alternatives.map((a) => a.text), ...q.sharedTexts.map((t) => sharedTextById.get(t)?.text || ''),
  ].join(' '))]));

  function applyFilters(f) {
    const terms = normalizeSearch(f.search || '').trim().split(/\s+/).filter(Boolean);
    let list = questions.filter((q) => {
      if (f.kind !== 'all' && q.kind !== f.kind) return false;
      if (q.annulled) return false;
      if (f.exams.length && !f.exams.includes(q.examId)) return false;
      if (f.sections.length && !f.sections.includes(q.section)) return false;
      if (f.topics.length && !q.topics.some((t) => f.topics.includes(t))) return false;
      if (f.formats.length && !f.formats.includes(q.format)) return false;
      if (f.status === 'flagged' && !state.flagged[q.id]) return false;
      if (['new', 'wrong', 'right'].includes(f.status) && statusOf(q.id) !== f.status) return false;
      if (terms.length && !terms.every((w) => searchText.get(q.id).includes(w))) return false;
      return true;
    });
    if (f.order === 'random') list = shuffle(list);
    return list;
  }

  // ------------------------------------------------------------------ strategy guide per question format

  const GUIDE = {
    'assertion-reason': {
      summary: 'Duas afirmações ligadas por PORQUE. Você julga cada uma e, só depois, a relação entre elas.',
      steps: [
        'Julgue a asserção I sozinha, como se o resto não existisse. Depois faça o mesmo com a II.',
        'Se alguma for falsa, a relação nem importa: sobra apenas a alternativa que combina com o seu julgamento.',
        'Só quando as duas forem verdadeiras pergunte: “a II explica por que a I acontece?”. Se a II for apenas outro fato correto sobre o tema, ela não justifica a I.',
      ],
    },
    statements: {
      summary: 'Uma lista de afirmações (I, II, III…) e alternativas que combinam essas afirmações.',
      steps: [
        'Comece pela afirmação de que você tem mais certeza e risque de uma vez todas as alternativas incompatíveis com ela.',
        'Repare nas afirmações que aparecem em quase todas as alternativas: raramente decidem a questão. Concentre-se nas que dividem as opções.',
        'Desconfie de afirmações com termos absolutos (sempre, nunca, todos, apenas, garante).',
      ],
    },
    'true-false': {
      summary: 'Uma sequência de V e F.',
      steps: ['Julgue primeiro os itens de que você tem certeza e elimine sequências incompatíveis.', 'Termos absolutos costumam marcar itens falsos.'],
    },
    matching: {
      summary: 'Associação entre colunas ou ordenação de etapas.',
      steps: ['Resolva primeiro a associação mais óbvia e elimine as alternativas que a contradizem.', 'Em ordenações, descobrir o primeiro e o último passo costuma bastar.'],
    },
    code: {
      summary: 'Trecho de código, pseudocódigo ou consulta SQL.',
      steps: [
        'Simule no papel: monte uma tabela com o valor de cada variável a cada linha ou iteração.',
        'Teste a entrada dada e também um caso-limite pequeno (lista vazia, 0, 1).',
        'Em SQL, confira cláusula por cláusula: tabelas e junções (JOIN … ON), filtro (WHERE), agrupamento (GROUP BY/HAVING) e ordenação (ORDER BY, ASC/DESC).',
        'As alternativas costumam diferir em um único detalhe: compare-as lado a lado antes de simular tudo.',
      ],
    },
    calculation: {
      summary: 'Resultado numérico ou de execução.',
      steps: [
        'Estime a ordem de grandeza antes da conta: várias alternativas caem fora dela.',
        'Confira unidades e prefixos (mA x A, k x M).',
        'Os distratores costumam vir de erros previsíveis: fator 2, série x paralelo, fórmula invertida, ordem trocada.',
      ],
    },
    interpretation: {
      summary: 'Texto, gráfico, tabela ou imagem como base.',
      steps: [
        'Leia primeiro o comando final para saber o que procurar no material.',
        'A resposta precisa decorrer do material apresentado. Alternativas verdadeiras “no mundo”, mas que o texto não sustenta, são distratores comuns.',
        'Em gráficos, confira eixo, unidade e período antes de comparar valores.',
        'Desconfie de generalizações e de relações de causa que o texto não afirma.',
      ],
    },
    conceptual: {
      summary: 'Pergunta direta sobre um conceito.',
      steps: [
        'Antes de ler as alternativas, formule a resposta com suas palavras.',
        'Elimine as alternativas com erro técnico evidente; normalmente sobra uma disputa entre duas.',
        'Entre duas parecidas, compare palavra por palavra: a diferença entre elas é o ponto que a questão avalia.',
      ],
    },
    essay: {
      summary: 'Resposta escrita, normalmente em até 15 ou 30 linhas.',
      steps: [
        'Liste os itens que o comando pede (a, b, c… ou 1, 2, 3) e responda cada um em um parágrafo próprio, na mesma ordem.',
        'Use os termos do próprio comando: isso facilita a correção.',
        'Feche com uma frase que retome a pergunta e respeite o limite de linhas.',
      ],
    },
  };

  /** Data-backed observations for a question format (HTML strings). */
  function formatEvidence(format) {
    const lines = [];
    if (format === 'statements' && P.statements.n) {
      const two = P.statements.byCount['2'] || 0;
      lines.push(`Em ${two} das ${P.statements.n} questões desse tipo nas provas analisadas, a resposta tinha exatamente duas afirmativas corretas.`);
    }
    if (format === 'assertion-reason' && P.assertionReason.n) {
      const o = P.assertionReason.outcomes;
      const onlyII = o['only-ii-true'] || 0;
      lines.push(`Em ${P.assertionReason.n} questões de asserção-razão, a resposta “I falsa, II verdadeira” apareceu ${onlyII} vez${onlyII === 1 ? '' : 'es'}; a justificativa correta (as duas verdadeiras e a II explica a I) apareceu ${o['both-true-justifies'] || 0}.`);
    }
    if (['conceptual', 'interpretation'].includes(format)) {
      const a = P.absolutes;
      const todos = a.words.find((w) => w.w === 'todos');
      lines.push(`Termos absolutos aparecem em ${fmtDecimal(a.distractorPct)}% das alternativas erradas e em ${fmtDecimal(a.correctPct)}% das corretas${todos ? ` (“todos”: ${todos.distractor} vezes em erradas, ${todos.correct} em corretas)` : ''}.`);
      const top = P.vocabulary.correct.slice(0, 5).map((v) => v.w);
      if (top.length) lines.push(`Palavras mais frequentes nas alternativas corretas do que nas erradas: ${top.map((w) => `<span class="highlight">${esc(w)}</span>`).join(', ')}.`);
    }
    return lines;
  }

  function hintHTML(q) {
    const guide = GUIDE[q.format] || GUIDE.conceptual;
    const evidence = formatEvidence(q.format);
    const terms = q.topics.map((t) => [t, (P.topicTerms[t] || []).slice(0, 8)]).filter(([, list]) => list.length);
    return `<details class="hint" id="hint">
      <summary><span>Pista do editor <span class="fine-print hint__shortcut">(tecla H)</span></span></summary>
      <div class="hint__body prose">
        ${q.negative ? '<p><span class="highlight"><b>Comando negativo.</b></span> A questão pede a alternativa incorreta ou a exceção. Grife essa palavra antes de ler as opções.</p>' : ''}
        <p><b>${esc(formatLabel(q.format))}.</b> ${esc(guide.summary)}</p>
        <ul>${guide.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
        ${evidence.length ? `<p class="kicker">O que os dados das provas mostram</p><ul>${evidence.map((l) => `<li>${l}</li>`).join('')}</ul>` : ''}
        ${terms.length ? `<p class="kicker">Termos que voltam sempre neste assunto</p>${terms.map(([t, list]) => `<p><b>${esc(topicLabel(t))}:</b> <i>${list.map(esc).join(', ')}</i></p>`).join('')}` : ''}
        <p class="fine-print">Use os padrões estatísticos para desempatar entre duas alternativas. Detalhes em <a href="#/padroes">Padrões</a>.</p>
      </div>
    </details>`;
  }

  // ------------------------------------------------------------------ shared components

  function imageHTML(item, alt) {
    // fixed width + max-width (no percentage): the fit-content clipping gets its final size before
    // the image loads, so nothing jumps
    const size = item.w ? `width="${item.w}" height="${item.h}" style="width:${Math.round(item.w * 0.72)}px"` : '';
    return `<img src="${esc(item.img)}" ${size} alt="${esc(alt)}" decoding="async">`;
  }

  function sharedTextsHTML(q) {
    return q.sharedTexts.map((id) => {
      const t = sharedTextById.get(id);
      if (!t) return '';
      const nums = t.nums.length > 2 ? `${t.nums[0]} a ${t.nums[t.nums.length - 1]}` : t.nums.join(' e ');
      return `<figure class="clipping clipping--shared">
        ${imageHTML(t, `Texto-base das questões ${nums}`)}
        <figcaption class="clipping__caption"><span>Texto-base das questões ${esc(nums)}</span></figcaption>
      </figure>`;
    }).join('');
  }

  function tagsHTML(q) {
    const statusText = { new: 'Ainda não respondida', right: 'Você acertou da última vez', wrong: 'Você errou da última vez', answered: 'Respondida' }[statusOf(q.id)];
    return `<div class="tags">
      <span class="tag">${esc(sectionLabel(q.section))}</span>
      ${q.topics.map((t) => `<span class="tag">${esc(topicLabel(t))}</span>`).join('')}
      <span class="tag">${esc(formatLabel(q.format))}</span>
      ${q.negative ? '<span class="tag tag--warning">Comando negativo</span>' : ''}
      ${q.annulled ? '<span class="tag tag--warning">Anulada pelo Inep</span>' : ''}
      <span class="tag">${esc(statusText)}</span>
    </div>`;
  }

  // ------------------------------------------------------------------ routing
  // Routes use Portuguese paths because they are visible in the address bar.

  const routes = [];
  const route = (pattern, render) => routes.push([pattern, render]);
  let teardown = null; // cleans up the previous screen (timers, key handlers)

  function navigate() {
    if (teardown) { teardown(); teardown = null; }
    const hash = location.hash.replace(/^#/, '') || '/';
    for (const [pattern, render] of routes) {
      const m = hash.match(pattern);
      if (!m) continue;
      document.querySelectorAll('.section-nav a').forEach((a) => {
        const target = a.getAttribute('href').slice(1); // "/estudar"
        const active = target === '/' ? hash === '/' : hash.startsWith(target) || (target === '/estudar' && hash.startsWith('/q/'));
        if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
      render(...m.slice(1));
      window.scrollTo(0, 0);
      return;
    }
    location.hash = '#/';
  }

  // ------------------------------------------------------------------ front page

  // One objective question per day (the same all day); prefers questions not answered yet.
  function dailyQuestionHTML() {
    const unseen = objectives.filter((q) => statusOf(q.id) === 'new' && q.section === 'specific');
    const pool = unseen.length ? unseen : objectives;
    const day = Math.floor(Date.now() / 86400000);
    const q = pool[(day * 7919) % pool.length];
    const e = examById.get(q.examId);
    const sentences = q.statement.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]/g) || [q.statement];
    let excerpt = sentences.find((s) => s.length > 60 && !/disponível em|acesso em/i.test(s)) || sentences[0];
    if (excerpt.length > 240) excerpt = excerpt.slice(0, 237).replace(/\s\S*$/, '') + '…';
    return `<div class="daily-question">
      <div>
        <p class="kicker">Questão do dia: ${esc(examFullName(e))}, ${esc(questionLabel(q))}</p>
        <blockquote>${esc(excerpt.trim())}</blockquote>
        <a class="btn btn--light btn--small" href="#/q/${esc(q.id)}">Resolver a questão do dia</a>
      </div>
      <a class="thumbnail" href="#/q/${esc(q.id)}" aria-hidden="true" tabindex="-1"><img src="${esc(q.img)}" alt=""></a>
    </div>`;
  }

  route(/^\/$/, function frontPage() {
    const stats = myStats();
    const total = objectives.length;
    const weakest = Object.entries(stats.byTopic).filter(([, v]) => v.n >= 3).map(([t, v]) => [t, v.ok / v.n]).sort((a, b) => a[1] - b[1])[0];

    let headline, dek, buttons;
    if (!stats.answered) {
      headline = `${fmtNum(total)} questões oficiais para resolver nesta edição`;
      dek = `Provas de ${[...new Set(exams.map((e) => e.year))].join(', ')} baixadas do site do Inep e reproduzidas sem alteração. Comece por um assunto nos classificados abaixo ou faça uma prova inteira.`;
      buttons = `<a class="btn" href="#/estudar" data-action="start-all">Começar a estudar</a><a class="btn btn--light" href="#/simulado">Montar um simulado</a>`;
    } else {
      headline = stats.answered === 1
        ? (stats.right ? 'Você acertou a primeira questão que respondeu' : 'Você errou a primeira questão, e é assim que se começa')
        : `Você acertou ${pct(stats.right, stats.answered)}% das ${fmtNum(stats.answered)} questões que já respondeu`;
      dek = weakest
        ? `O assunto que mais derruba você é <b>${esc(topicLabel(weakest[0]))}</b>, com ${Math.round(weakest[1] * 100)}% de acerto. É por ele que vale começar a revisão.`
        : 'Responda pelo menos três questões de um assunto para a Gazeta apontar seus pontos fracos.';
      buttons = weakest
        ? `<button class="btn" data-action="study-topic" data-topic="${esc(weakest[0])}">Estudar ${esc(topicLabel(weakest[0]))}</button><a class="btn btn--light" href="#/revisao">Revisar erros</a>`
        : `<a class="btn" href="#/estudar">Continuar estudando</a>`;
    }

    const daysLeft = state.examDate ? Math.ceil((new Date(state.examDate + 'T12:00:00') - new Date()) / 86400000) : null;
    const unseenCount = objectives.filter((q) => statusOf(q.id) === 'new').length;

    const examListHTML = exams.map((e) => {
      const qs = objectives.filter((q) => q.examId === e.id);
      const done = qs.filter((q) => statusOf(q.id) !== 'new').length;
      const right = qs.filter((q) => statusOf(q.id) === 'right').length;
      return `<li><a href="#/estudar" data-action="study-exam" data-exam="${esc(e.id)}"><span class="year">${e.year}</span>${esc(examName(e))}</a>
        <div class="fine-print">${plural(qs.length, 'questão objetiva', 'questões objetivas')}; ${done ? `${done} feitas, ${pct(right, done)}% de acerto` : 'nenhuma feita ainda'}</div>
        <div class="progress-bar" aria-hidden="true"><i style="width:${pct(done, qs.length)}%"></i><i class="correct" style="width:${pct(right, qs.length)}%"></i></div></li>`;
    }).join('');

    const listingsHTML = (group) => Object.entries(DATA.topics).filter(([, t]) => t.group === group).map(([id, t]) => {
      const qs = objectives.filter((q) => q.topics.includes(id));
      if (!qs.length) return '';
      const mine = stats.byTopic[id];
      const terms = (P.topicTerms[id] || []).slice(0, 4);
      return `<button class="listing" data-action="study-topic" data-topic="${esc(id)}">
        <span class="listing__title">${esc(t.label)}</span>
        <span class="listing__stats"><span>${plural(qs.length, 'questão', 'questões')}</span><span>${mine ? `você: ${pct(mine.ok, mine.n)}%` : 'sem tentativas'}</span></span>
        ${terms.length ? `<span class="listing__terms">${terms.map(esc).join(', ')}</span>` : ''}
      </button>`;
    }).join('');

    const abs = P.absolutes;
    const todos = abs.words.find((w) => w.w === 'todos');

    main.innerHTML = `
    <div class="page grid">
      <section class="col-8 front-lead">
        <p class="kicker">Manchete de hoje</p>
        <h1 class="headline">${esc(headline)}</h1>
        <p class="dek">${dek}</p>
        <div class="scoreboard">
          <div><b>${fmtNum(stats.answered)}</b><span>respondidas de ${fmtNum(total)}</span></div>
          <div><b>${stats.answered ? pct(stats.right, stats.answered) + '%' : '—'}</b><span>de acerto</span></div>
          <div><b>${fmtNum(stats.days)}</b><span>${stats.days === 1 ? 'dia de estudo' : 'dias de estudo'}</span></div>
        </div>
        <div class="actions">${buttons}</div>
        ${dailyQuestionHTML()}
      </section>
      <aside class="col-4 rule-left">
        <div class="forecast">
          <p class="kicker">Previsão</p>
          ${daysLeft !== null && daysLeft >= 0
            ? `<div class="forecast__days">${daysLeft === 0 ? 'É hoje' : plural(daysLeft, 'dia', 'dias')}</div><p class="fine-print">até a sua prova. ${daysLeft > 0 ? `Dá ${Math.max(1, Math.ceil(unseenCount / daysLeft))} questões novas por dia para ver tudo.` : 'Boa prova!'}</p>`
            : '<p class="title-sm">Quando é a sua prova?</p><p class="fine-print">Informe a data e a Gazeta calcula quantas questões por dia você precisa fazer.</p>'}
          <label for="exam-date">Data do Enade</label>
          <input id="exam-date" type="text" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="dd/mm/aaaa" aria-describedby="exam-date-error" value="${esc(isoToBr(state.examDate))}">
          <p class="fine-print field-error" id="exam-date-error" hidden>Use o formato dd/mm/aaaa, com uma data que exista.</p>
        </div>
        <div class="block">
          <h2 class="title-sm">Arquivo de provas</h2>
          <ul class="exam-list">${examListHTML}</ul>
        </div>
      </aside>

      <section class="col-12 block block--thick">
        <p class="kicker">Classificados</p>
        <h2 class="title">Escolha um assunto e comece por ele</h2>
        <p class="group-label">Componente específico de Computação</p>
        <div class="classifieds">${listingsHTML('specific')}</div>
        <p class="group-label group-label--spaced">Formação geral (comum a todos os cursos)</p>
        <div class="classifieds">${listingsHTML('general')}</div>
      </section>
      <section class="col-12 block">
        <p class="kicker">Como ler esta Gazeta</p>
        <h2 class="title">Questão original, resposta oficial</h2>
        <!-- full width, split into three ruled columns so lines stay at a readable length -->
        <div class="grid how-to">
          <div class="col-4">
            <h3 class="title-sm">O que você vê</h3>
            <p class="prose prose--small">Cada questão aparece como um recorte do caderno do Inep, com figuras, tabelas e código exatamente como na prova. O gabarito é o definitivo publicado pelo Inep.</p>
          </div>
          <div class="col-4 rule-left">
            <h3 class="title-sm">Como estudar</h3>
            <p class="prose prose--small">Em <a href="#/estudar">Estudar</a> você filtra por prova, assunto, formato e situação, e vê o resultado na hora. Em <a href="#/simulado">Simulado</a> o relógio corre e o gabarito só aparece na entrega.</p>
          </div>
          <div class="col-4 rule-left">
            <h3 class="title-sm">Atalhos nas questões</h3>
            <dl class="shortcuts">
              <dt><kbd>A</kbd>–<kbd>E</kbd></dt><dd>responder</dd>
              <dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>navegar</dd>
              <dt><kbd>H</kbd></dt><dd>abrir a pista</dd>
              <dt><kbd>M</kbd></dt><dd>marcar para revisar</dd>
            </dl>
          </div>
        </div>
      </section>
    </div>`;

    const dateInput = document.getElementById('exam-date');
    const dateError = document.getElementById('exam-date-error');
    const showDateError = (show) => {
      dateError.hidden = !show;
      dateInput.setAttribute('aria-invalid', String(show));
    };
    dateInput.addEventListener('input', () => {
      dateInput.value = maskBrDate(dateInput.value);
      showDateError(false);
      // a complete, valid date is saved right away; the front page then shows the countdown
      const iso = brToIso(dateInput.value);
      if (iso && iso !== state.examDate) { state.examDate = iso; save(); navigate(); }
    });
    dateInput.addEventListener('change', () => {
      if (!dateInput.value) { state.examDate = ''; save(); navigate(); return; }
      showDateError(!brToIso(dateInput.value));
    });
  });

  // ------------------------------------------------------------------ study (filters)

  let filtersOpen = false; // on phones the filter panel stays collapsed until the user opens it

  route(/^\/estudar$/, function studyPage() {
    const f = state.filters;
    const list = applyFilters({ ...f, order: 'exam' });
    const countWhere = (pred) => questions.filter((q) => !q.annulled && (f.kind === 'all' || q.kind === f.kind) && pred(q)).length;

    const checkbox = (group, value, label, n) => `<label class="option"><input type="checkbox" data-filter="${group}" value="${esc(value)}" ${f[group].includes(value) ? 'checked' : ''}><span>${label}</span><small>${n}</small></label>`;
    const radio = (group, value, label) => `<label class="option"><input type="radio" name="${group}" data-filter-single="${group}" value="${esc(value)}" ${f[group] === value ? 'checked' : ''}><span>${label}</span></label>`;

    const topicGroup = (group, title) => `<p class="group-title">${title}</p>` + Object.entries(DATA.topics).filter(([, t]) => t.group === group)
      .map(([id, t]) => [id, t, countWhere((q) => q.topics.includes(id))]).filter(([, , n]) => n)
      .map(([id, t, n]) => checkbox('topics', id, esc(t.label), n)).join('');

    const formats = Object.entries(DATA.formats).map(([id, label]) => [id, label, countWhere((q) => q.format === id)]).filter(([, , n]) => n);
    const activeCount = f.exams.length + f.sections.length + f.topics.length + f.formats.length + (f.status !== 'all') + (f.kind !== 'objective') + (f.search.trim() ? 1 : 0);
    const statusText = { new: '', right: 'acertou', wrong: 'errou', answered: 'feita' };

    const rows = list.slice(0, 60).map((q) => {
      const e = examById.get(q.examId);
      return `<tr><td><a href="#/q/${esc(q.id)}" data-action="open-from-list" data-id="${esc(q.id)}">${esc(questionLabel(q))}</a></td>
        <td>${esc(examName(e))} ${e.year}</td><td class="col-topic">${q.topics.map((t) => esc(topicLabel(t))).join(', ')}</td>
        <td>${statusText[statusOf(q.id)]}${state.flagged[q.id] ? ' ★' : ''}</td></tr>`;
    }).join('');

    main.innerHTML = `
    <div class="page grid">
      <aside class="col-3">
        <details class="filter-panel" id="filter-panel" ${filtersOpen || window.innerWidth > 980 ? 'open' : ''}>
        <summary><span>Filtros</span><span class="fine-print">${activeCount ? plural(activeCount, 'filtro ativo', 'filtros ativos') : 'nenhum filtro ativo'}</span></summary>
        <form class="filters" id="filters-form" onsubmit="return false">
          <fieldset><legend>Buscar palavra</legend>
            <input class="search" type="search" id="search" placeholder="ex.: TCP, BNCC, escalonamento" value="${esc(f.search)}">
          </fieldset>
          <fieldset><legend>Provas</legend>
            ${exams.map((e) => checkbox('exams', e.id, `<b>${e.year}</b> ${esc(examName(e))}`, countWhere((q) => q.examId === e.id))).join('')}
          </fieldset>
          <fieldset><legend>Parte da prova</legend>
            ${checkbox('sections', 'specific', 'Componente específico', countWhere((q) => q.section === 'specific'))}
            ${checkbox('sections', 'general', 'Formação geral', countWhere((q) => q.section === 'general'))}
          </fieldset>
          <fieldset><legend>Assuntos</legend>
            ${topicGroup('specific', 'Computação')}
            ${topicGroup('general', 'Formação geral')}
          </fieldset>
          <fieldset><legend>Formato da questão</legend>
            ${formats.map(([id, label, n]) => checkbox('formats', id, esc(label), n)).join('')}
          </fieldset>
          <fieldset><legend>Situação</legend>
            ${radio('status', 'all', 'Todas')}
            ${radio('status', 'new', 'Ainda não respondidas')}
            ${radio('status', 'wrong', 'Errei na última tentativa')}
            ${radio('status', 'right', 'Acertei na última tentativa')}
            ${radio('status', 'flagged', 'Marcadas para revisar')}
          </fieldset>
          <fieldset><legend>Tipo</legend>
            ${radio('kind', 'objective', 'Objetivas')}
            ${radio('kind', 'essay', 'Discursivas')}
            ${radio('kind', 'all', 'Todas')}
          </fieldset>
          <div class="filter-actions"><button type="button" class="link-btn" data-action="clear-filters">Limpar filtros</button></div>
        </form>
        </details>
      </aside>
      <section class="col-9 rule-left">
        <p class="kicker">Caderno de estudos</p>
        <div class="results-header">
          <h1 class="title no-margin"><b>${fmtNum(list.length)}</b> ${list.length === 1 ? 'questão encontrada' : 'questões encontradas'}</h1>
          <div class="actions">
            <button class="btn" data-action="start-session" data-order="exam" ${list.length ? '' : 'disabled'}>Resolver na ordem da prova</button>
            <button class="btn btn--light" data-action="start-session" data-order="random" ${list.length ? '' : 'disabled'}>Embaralhar</button>
          </div>
        </div>
        ${state.session && state.session.ids.length ? `<p class="fine-print">Você tem uma sessão em andamento (${state.session.idx + 1} de ${state.session.ids.length}). <a href="#/q/${esc(state.session.ids[state.session.idx])}">Continuar de onde parou</a></p>` : ''}
        ${list.length ? `<div class="table-wrap"><table class="table table--text">
          <caption>${list.length > 60 ? 'Primeiras 60 questões do filtro' : 'Questões do filtro'}, na ordem das provas</caption>
          <thead><tr><th>Questão</th><th>Prova</th><th class="col-topic">Assunto</th><th>Você</th></tr></thead>
          <tbody>${rows}</tbody></table></div>`
          : '<p class="empty">Nenhuma questão com esses filtros. Desmarque algum assunto ou mude a situação para “Todas”.</p>'}
      </section>
    </div>`;

    const panel = document.getElementById('filter-panel');
    panel.addEventListener('toggle', () => { filtersOpen = panel.open; });
    const form = document.getElementById('filters-form');
    form.addEventListener('change', (ev) => {
      const input = ev.target;
      if (input.dataset.filter) {
        const group = input.dataset.filter;
        f[group] = [...form.querySelectorAll(`[data-filter="${group}"]:checked`)].map((i) => i.value);
      } else if (input.dataset.filterSingle) {
        f[input.dataset.filterSingle] = input.value;
      }
      save();
      studyPage();
    });
    const search = document.getElementById('search');
    let debounce;
    search.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        f.search = search.value;
        save();
        studyPage();
        const box = document.getElementById('search');
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
      }, 300);
    });
  });

  function startSession(ids, origin) {
    if (!ids.length) return;
    state.session = { ids, idx: 0, origin: origin || 'study' };
    save();
    location.hash = '#/q/' + ids[0];
  }

  // ------------------------------------------------------------------ question (study mode)

  route(/^\/q\/(.+)$/, function questionPage(rawId) {
    const q = questionById.get(decodeURIComponent(rawId));
    if (!q) { location.hash = '#/estudar'; return; }
    if (!state.session || !state.session.ids.includes(q.id)) state.session = { ids: [q.id], idx: 0, origin: 'single' };
    state.session.idx = state.session.ids.indexOf(q.id);
    save();
    const session = state.session;
    const e = examById.get(q.examId);
    const last = lastAttempt(q.id);
    const startedAt = Date.now();
    let answered = false;

    const mapHTML = session.ids.map((id, i) => {
      const st = statusOf(id);
      const classes = [
        i === session.idx ? 'is-current' : '',
        st === 'right' ? 'is-right' : st === 'wrong' ? 'is-wrong' : st === 'answered' ? 'is-answered' : '',
        state.flagged[id] ? 'is-flagged' : '',
      ].join(' ');
      const other = questionById.get(id);
      return `<button class="${classes}" data-action="go" data-i="${i}" title="${esc(examFullName(examById.get(other.examId)))}, ${esc(questionLabel(other))}">${i + 1}</button>`;
    }).join('');

    const letters = q.alternatives.length ? q.alternatives.map((a) => a.letter) : ['A', 'B', 'C', 'D', 'E'].slice(0, e.options || 5);

    const couponHTML = q.kind === 'objective' ? `
      <section class="coupon" aria-labelledby="coupon-title">
        <h2 class="coupon__title" id="coupon-title"><span>Sua resposta</span><span class="fine-print">${last ? `Última tentativa: ${esc(last.choice)} (${last.ok === true ? 'acertou' : last.ok === false ? 'errou' : 'anulada'})` : 'Teclas A a ' + letters[letters.length - 1]}</span></h2>
        <div class="choices" role="group" aria-label="Alternativas">
          ${letters.map((l) => `<button class="choice" data-action="answer" data-letter="${l}" aria-pressed="false" aria-label="Alternativa ${l}">${l}</button>`).join('')}
        </div>
        <div id="verdict" aria-live="polite"></div>
      </section>`
      : `<section class="coupon">
        <h2 class="coupon__title"><span>Seu rascunho</span><span class="fine-print">salvo automaticamente neste navegador</span></h2>
        <textarea class="draft" id="draft" placeholder="Escreva sua resposta como faria na prova.">${esc(state.drafts[q.id] || '')}</textarea>
        <p class="fine-print">${e.sources.answerGuide ? `Compare com o <a href="${esc(e.sources.answerGuide)}" target="_blank" rel="noopener">padrão de resposta oficial do Inep</a>.` : 'O Inep não publicou padrão de resposta para esta prova; compare com o comando item por item.'}</p>
      </section>`;

    main.innerHTML = `
    <div class="page grid">
      <article class="col-8">
        <div class="question-header">
          <div><p class="kicker">${esc(examFullName(e))}, ${esc(sectionLabel(q.section))}</p>
          <h1 class="title">${esc(questionLabel(q))}</h1></div>
          <span class="fine-print">${session.idx + 1} de ${session.ids.length}</span>
        </div>
        ${tagsHTML(q)}
        ${sharedTextsHTML(q)}
        <figure class="clipping">
          ${imageHTML(q, `${questionLabel(q)} da prova ${examFullName(e)}, recorte do caderno oficial`)}
          <figcaption class="clipping__caption">
            <span>Recorte do caderno 1, página ${q.page}</span>
            <span><button class="link-btn" data-action="toggle-text">Ver texto extraído</button> <a href="${esc(e.sources.exam)}#page=${q.page}" target="_blank" rel="noopener">Abrir no PDF do Inep</a></span>
          </figcaption>
          <div id="extracted-text" hidden></div>
        </figure>
        ${couponHTML}
        ${hintHTML(q)}
        <nav class="question-nav" aria-label="Navegação entre questões">
          <button class="btn btn--light" data-action="previous" ${session.idx ? '' : 'disabled'}>← Anterior</button>
          <button class="btn btn--light" data-action="flag" aria-pressed="${!!state.flagged[q.id]}">${state.flagged[q.id] ? '★ Marcada para revisar' : '☆ Marcar para revisar'}</button>
          <button class="btn" data-action="next" ${session.idx < session.ids.length - 1 ? '' : 'disabled'}>Próxima →</button>
        </nav>
      </article>
      <aside class="col-4 rule-left">
        <h2 class="title-sm">Esta sessão</h2>
        <p class="fine-print">${plural(session.ids.length, 'questão', 'questões')}. Verde: acertou; vermelho: errou; traço amarelo: marcada.</p>
        <div class="question-map">${mapHTML}</div>
        <div class="block">
          <h2 class="title-sm">Sobre a prova</h2>
          <p class="prose prose--small">${esc(examSubtitle(e))}. ${plural(e.objectiveCount, 'questão objetiva', 'questões objetivas')} com ${e.options} alternativas.</p>
          <p class="fine-print">Arquivos oficiais: <a href="${esc(e.sources.exam)}" target="_blank" rel="noopener">caderno de prova</a>, <a href="${esc(e.sources.answerKey)}" target="_blank" rel="noopener">gabarito definitivo</a>${e.sources.testMap ? `, <a href="${esc(e.sources.testMap)}" target="_blank" rel="noopener">mapa da prova</a>` : ''}.</p>
        </div>
        <div class="block"><a href="#/estudar">Voltar aos filtros</a></div>
      </aside>
    </div>`;

    if (q.kind === 'essay') {
      const draft = document.getElementById('draft');
      draft.addEventListener('input', () => { state.drafts[q.id] = draft.value; save(); });
    }

    function showResult(choice, ok, animate) {
      answered = true;
      main.querySelectorAll('.choice').forEach((b) => {
        b.disabled = true;
        const l = b.dataset.letter;
        if (l === choice) b.setAttribute('aria-pressed', 'true');
        if (q.answer && l === q.answer) b.classList.add('is-correct');
        else if (l === choice && ok === false) b.classList.add('is-wrong');
      });
      const verdict = document.getElementById('verdict');
      const stamp = ok === true ? '<span class="stamp stamp--right">Certo!</span>'
        : ok === false ? `<span class="stamp stamp--wrong">Errou</span><span>Gabarito oficial: <b>${esc(q.answer)}</b></span>`
        : '<span class="stamp stamp--neutral">Anulada</span><span>O Inep anulou esta questão; ela não conta no seu placar.</span>';
      verdict.innerHTML = `<div class="verdict">${stamp}
        <span class="actions">
          <button class="link-btn" data-action="retry">Responder de novo</button>
          ${session.idx < session.ids.length - 1 ? '<button class="btn btn--small" data-action="next">Próxima →</button>' : '<a class="btn btn--small" href="#/estudar">Terminar sessão</a>'}
        </span></div>`;
      if (!animate) verdict.querySelector('.stamp')?.style.setProperty('animation', 'none');
      const current = main.querySelector('.question-map .is-current');
      if (current && ok !== null) {
        current.classList.remove('is-right', 'is-wrong', 'is-answered');
        current.classList.add(ok ? 'is-right' : 'is-wrong');
      }
    }

    function goTo(i) {
      if (i < 0 || i >= session.ids.length) return;
      location.hash = '#/q/' + session.ids[i];
    }

    function onClick(ev) {
      const b = ev.target.closest('[data-action]');
      if (!b || !main.contains(b)) return;
      const action = b.dataset.action;
      if (action === 'answer' && !answered) {
        const choice = b.dataset.letter;
        showResult(choice, recordAttempt(q, choice, 'study', Date.now() - startedAt), true);
      } else if (action === 'retry') {
        answered = false;
        main.querySelectorAll('.choice').forEach((x) => { x.disabled = false; x.classList.remove('is-correct', 'is-wrong'); x.setAttribute('aria-pressed', 'false'); });
        document.getElementById('verdict').innerHTML = '';
      } else if (action === 'next') goTo(session.idx + 1);
      else if (action === 'previous') goTo(session.idx - 1);
      else if (action === 'go') goTo(+b.dataset.i);
      else if (action === 'flag') {
        if (state.flagged[q.id]) delete state.flagged[q.id]; else state.flagged[q.id] = true;
        save();
        b.setAttribute('aria-pressed', String(!!state.flagged[q.id]));
        b.textContent = state.flagged[q.id] ? '★ Marcada para revisar' : '☆ Marcar para revisar';
        main.querySelector('.question-map .is-current')?.classList.toggle('is-flagged', !!state.flagged[q.id]);
      } else if (action === 'toggle-text') {
        const box = document.getElementById('extracted-text');
        box.hidden = !box.hidden;
        if (!box.hidden && !box.innerHTML) {
          const alts = q.alternatives.map((a) => `${a.letter}) ${a.text}`).join('\n');
          box.innerHTML = `<p class="fine-print note-above">Texto extraído automaticamente do PDF, útil para leitores de tela e para copiar. Fórmulas, figuras e tabelas valem como no recorte acima.</p><div class="extracted-text">${esc(q.statement + (alts ? '\n\n' + alts : ''))}</div>`;
        }
        b.textContent = box.hidden ? 'Ver texto extraído' : 'Esconder texto extraído';
      }
    }
    function onKey(ev) {
      if (ev.target.closest('input, textarea, select') || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const k = ev.key.toUpperCase();
      if (!answered && q.kind === 'objective' && letters.includes(k)) {
        main.querySelector(`.choice[data-letter="${k}"]`)?.click();
      } else if (ev.key === 'ArrowRight' || k === 'N') goTo(session.idx + 1);
      else if (ev.key === 'ArrowLeft' || k === 'P') goTo(session.idx - 1);
      else if (k === 'H') {
        const hint = document.getElementById('hint');
        hint.open = !hint.open;
        if (hint.open) hint.scrollIntoView({ block: 'nearest' });
      } else if (k === 'M') main.querySelector('[data-action="flag"]')?.click();
      else return;
      ev.preventDefault();
    }
    main.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    teardown = () => { main.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); };
  });

  // ------------------------------------------------------------------ mock exam ("simulado")

  route(/^\/simulado$/, function mockSetupPage() {
    if (state.currentMock) { location.hash = '#/simulado/prova'; return; }
    const recent = state.mockExams.slice(-6).reverse();
    main.innerHTML = `
    <div class="page grid">
      <section class="col-7">
        <p class="kicker">Simulado</p>
        <h1 class="headline">Relógio correndo, gabarito só no fim</h1>
        <p class="dek">Como no dia da prova: sem pista e sem resultado a cada questão. A Gazeta corrige tudo quando você entregar.</p>

        <div class="block block--thick">
          <h2 class="title">Uma prova inteira</h2>
          <p class="prose">Todas as questões objetivas de um caderno, na ordem original.</p>
          <div class="actions">${exams.map((e) => `<button class="btn btn--light" data-action="mock-exam" data-exam="${esc(e.id)}">${e.year} ${esc(examName(e))}</button>`).join('')}</div>
        </div>

        <form class="block filters" id="mock-form" onsubmit="return false">
          <h2 class="title">Um simulado sob medida</h2>
          <fieldset><legend>Provas</legend>
            ${exams.map((e) => `<label class="option"><input type="checkbox" name="exams" value="${esc(e.id)}" checked><span><b>${e.year}</b> ${esc(examName(e))}</span></label>`).join('')}
          </fieldset>
          <fieldset><legend>Parte</legend>
            <label class="option"><input type="checkbox" name="sections" value="specific" checked><span>Componente específico</span></label>
            <label class="option"><input type="checkbox" name="sections" value="general" checked><span>Formação geral</span></label>
          </fieldset>
          <fieldset><legend>Assuntos <span class="fine-print">(nenhum marcado = todos)</span></legend>
            ${Object.entries(DATA.topics).filter(([id]) => objectives.some((q) => q.topics.includes(id))).map(([id, t]) => `<label class="option"><input type="checkbox" name="topics" value="${esc(id)}"><span>${esc(t.label)}</span></label>`).join('')}
          </fieldset>
          <fieldset><legend>Preferência</legend>
            <label class="option"><input type="checkbox" name="unseenFirst" value="1"><span>Priorizar questões que ainda não respondi</span></label>
          </fieldset>
          <fieldset><legend>Tamanho e tempo</legend>
            <label class="option option--select">Questões <select name="count">${[10, 15, 20, 30, 40].map((n) => `<option ${n === 20 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            <label class="option option--select">Minutos por questão <select name="minutes">${[2, 3, 4, 5, 6].map((n) => `<option ${n === 4 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            <p class="fine-print">No Enade, a prova inteira dura entre quatro horas e quatro horas e meia: cerca de quatro minutos por questão, contando a discursiva.</p>
          </fieldset>
          <button class="btn" data-action="mock-custom">Começar simulado</button>
        </form>
      </section>
      <aside class="col-5 rule-left">
        <h2 class="title-sm">Boletins anteriores</h2>
        ${recent.length ? `<table class="table"><thead><tr><th>Data</th><th>Acertos</th><th>Tempo</th></tr></thead><tbody>
          ${recent.map((m) => `<tr><td><a href="#/simulado/resultado/${esc(m.id)}">${shortDate(m.at)}</a></td><td>${m.correct}/${m.total} (${pct(m.correct, m.total)}%)</td><td>${fmtDuration(m.duration)}</td></tr>`).join('')}
        </tbody></table>` : '<p class="prose">Nenhum simulado entregue ainda. O primeiro boletim aparece aqui.</p>'}
      </aside>
    </div>`;

    const onClick = (ev) => {
      const b = ev.target.closest('[data-action]');
      if (!b) return;
      if (b.dataset.action === 'mock-exam') {
        const e = examById.get(b.dataset.exam);
        const ids = objectives.filter((q) => q.examId === e.id).map((q) => q.id);
        startMock(ids, Math.round(ids.length * 4), examFullName(e));
      } else if (b.dataset.action === 'mock-custom') {
        const form = document.getElementById('mock-form');
        const checked = (name) => [...form.querySelectorAll(`[name="${name}"]:checked`)].map((i) => i.value);
        const examIds = checked('exams'), sections = checked('sections'), topics = checked('topics');
        const count = +form.count.value, minutes = +form.minutes.value;
        let pool = objectives.filter((q) => examIds.includes(q.examId) && sections.includes(q.section) && (!topics.length || q.topics.some((t) => topics.includes(t))));
        if (!pool.length) { alert('Nenhuma questão com essa combinação. Marque mais provas, partes ou assuntos.'); return; }
        pool = shuffle(pool);
        if (form.unseenFirst.checked) pool.sort((a, b) => (statusOf(a.id) === 'new' ? 0 : 1) - (statusOf(b.id) === 'new' ? 0 : 1));
        const ids = pool.slice(0, count).map((q) => q.id);
        startMock(ids, ids.length * minutes, 'Simulado personalizado');
      }
    };
    main.addEventListener('click', onClick);
    teardown = () => main.removeEventListener('click', onClick);
  });

  function startMock(ids, minutes, title) {
    state.currentMock = { ids, idx: 0, choices: {}, startedAt: Date.now(), limit: minutes * 60000, title };
    save();
    location.hash = '#/simulado/prova';
  }

  route(/^\/simulado\/prova$/, function mockQuestionPage() {
    const mock = state.currentMock;
    if (!mock) { location.hash = '#/simulado'; return; }
    const q = questionById.get(mock.ids[mock.idx]);
    const e = examById.get(q.examId);
    const letters = q.alternatives.length ? q.alternatives.map((a) => a.letter) : ['A', 'B', 'C', 'D', 'E'].slice(0, e.options);
    const chosen = mock.choices[q.id];
    const answeredCount = () => Object.keys(mock.choices).length;

    main.innerHTML = `
    <div class="page grid">
      <article class="col-8">
        <div class="question-header">
          <div><p class="kicker">${esc(mock.title)}</p><h1 class="title">Questão ${mock.idx + 1} de ${mock.ids.length}</h1></div>
          <span class="timer" id="timer" aria-live="off"></span>
        </div>
        <p class="fine-print subhead">${esc(examFullName(e))}, ${esc(questionLabel(q))}</p>
        ${sharedTextsHTML(q)}
        <figure class="clipping">${imageHTML(q, `${questionLabel(q)} da prova ${examFullName(e)}`)}</figure>
        <section class="coupon">
          <h2 class="coupon__title"><span>Marque no cartão-resposta</span><span class="fine-print">pode mudar até entregar</span></h2>
          <div class="choices" role="group" aria-label="Alternativas">
            ${letters.map((l) => `<button class="choice" data-action="mock-choose" data-letter="${l}" aria-pressed="${chosen === l}">${l}</button>`).join('')}
          </div>
        </section>
        <nav class="question-nav">
          <button class="btn btn--light" data-action="mock-prev" ${mock.idx ? '' : 'disabled'}>← Anterior</button>
          ${mock.idx < mock.ids.length - 1 ? '<button class="btn" data-action="mock-next">Próxima →</button>' : '<button class="btn" data-action="submit">Entregar simulado</button>'}
        </nav>
      </article>
      <aside class="col-4 rule-left">
        <h2 class="title-sm">Cartão-resposta</h2>
        <p class="fine-print" id="mock-count">${answeredCount()} de ${mock.ids.length} marcadas</p>
        <div class="question-map">${mock.ids.map((id, i) => `<button class="${i === mock.idx ? 'is-current' : ''} ${mock.choices[id] ? 'is-answered' : ''}" data-action="mock-go" data-i="${i}">${i + 1}</button>`).join('')}</div>
        <div class="actions"><button class="btn" data-action="submit">Entregar e corrigir</button><button class="link-btn" data-action="abandon">Abandonar simulado</button></div>
      </aside>
    </div>`;

    const timerEl = document.getElementById('timer');
    const tick = () => {
      const remaining = mock.startedAt + mock.limit - Date.now();
      timerEl.textContent = remaining > 0 ? fmtDuration(remaining) : 'Tempo esgotado';
      timerEl.classList.toggle('is-urgent', remaining < 5 * 60000);
    };
    tick();
    const interval = setInterval(tick, 1000);

    // navigate() tears down this screen's listeners before drawing the next question
    const goTo = (i) => { if (i >= 0 && i < mock.ids.length) { mock.idx = i; save(); navigate(); } };
    const onClick = (ev) => {
      const b = ev.target.closest('[data-action]');
      if (!b) return;
      const action = b.dataset.action;
      if (action === 'mock-choose') {
        mock.choices[q.id] = b.dataset.letter;
        save();
        main.querySelectorAll('.choice').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        main.querySelector('.question-map .is-current')?.classList.add('is-answered');
        document.getElementById('mock-count').textContent = `${answeredCount()} de ${mock.ids.length} marcadas`;
      } else if (action === 'mock-next') goTo(mock.idx + 1);
      else if (action === 'mock-prev') goTo(mock.idx - 1);
      else if (action === 'mock-go') goTo(+b.dataset.i);
      else if (action === 'submit') {
        const blank = mock.ids.length - answeredCount();
        if (blank && !confirm(`Ainda há ${plural(blank, 'questão', 'questões')} em branco. Entregar assim mesmo?`)) return;
        submitMock();
      } else if (action === 'abandon') {
        if (!confirm('Abandonar este simulado? As marcações dele serão descartadas.')) return;
        state.currentMock = null;
        save();
        location.hash = '#/simulado';
      }
    };
    const onKey = (ev) => {
      if (ev.target.closest('input, textarea, select') || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const k = ev.key.toUpperCase();
      if (letters.includes(k)) main.querySelector(`.choice[data-letter="${k}"]`)?.click();
      else if (ev.key === 'ArrowRight') goTo(mock.idx + 1);
      else if (ev.key === 'ArrowLeft') goTo(mock.idx - 1);
      else return;
      ev.preventDefault();
    };
    main.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    teardown = () => { clearInterval(interval); main.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); };
  });

  function submitMock() {
    const mock = state.currentMock;
    let correct = 0;
    for (const id of mock.ids) {
      const choice = mock.choices[id];
      if (choice && recordAttempt(questionById.get(id), choice, 'mock') === true) correct++;
    }
    const result = {
      id: String(Date.now()), at: Date.now(), title: mock.title, ids: mock.ids, choices: mock.choices,
      duration: Date.now() - mock.startedAt, limit: mock.limit, correct, total: mock.ids.length,
    };
    state.mockExams.push(result);
    state.currentMock = null;
    save();
    location.hash = '#/simulado/resultado/' + result.id;
  }

  route(/^\/simulado\/resultado\/(.+)$/, function mockResultPage(resultId) {
    const result = state.mockExams.find((m) => m.id === resultId);
    if (!result) { location.hash = '#/simulado'; return; }
    const byTopic = {};
    for (const id of result.ids) {
      const q = questionById.get(id);
      for (const t of q.topics) {
        byTopic[t] = byTopic[t] || { n: 0, ok: 0 };
        byTopic[t].n++;
        if (result.choices[id] === q.answer) byTopic[t].ok++;
      }
    }
    const topicBars = Object.entries(byTopic).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n)
      .map(([t, v]) => `<li><span>${esc(topicLabel(t))}</span><span class="track"><i class="${v.ok / v.n >= 0.6 ? 'olive' : 'wine'}" style="width:${pct(v.ok, v.n)}%"></i></span><b>${v.ok}/${v.n}</b></li>`).join('');
    const score = pct(result.correct, result.total);
    main.innerHTML = `
    <div class="page grid">
      <section class="col-7">
        <p class="kicker">Boletim, ${shortDate(result.at)}</p>
        <h1 class="headline">${result.correct} acertos em ${result.total}: ${score}%</h1>
        <p class="dek">${esc(result.title)}. Tempo usado: ${fmtDuration(result.duration)} de ${fmtDuration(result.limit)}${result.duration > result.limit ? ', passou do limite' : ''}. Comece a revisão pelos assuntos em vermelho.</p>
        <div class="block block--thick">
          <h2 class="title-sm">Desempenho por assunto</h2>
          <ul class="bars">${topicBars}</ul>
        </div>
        <div class="actions actions--spaced">
          <button class="btn" data-action="review-mistakes">Rever as que errei</button>
          <a class="btn btn--light" href="#/simulado">Novo simulado</a>
        </div>
      </section>
      <aside class="col-5 rule-left">
        <h2 class="title-sm">Suas respostas e o gabarito</h2>
        <table class="table"><thead><tr><th>#</th><th>Questão</th><th>Você</th><th>Gabarito</th></tr></thead><tbody>
          ${result.ids.map((id, i) => {
            const q = questionById.get(id);
            const choice = result.choices[id];
            return `<tr><td>${i + 1}</td><td><a href="#/q/${esc(id)}">${esc(examById.get(q.examId).year)} ${esc(questionLabel(q))}</a></td><td class="${choice === q.answer ? 'is-right' : 'is-wrong'}">${choice || 'branco'}</td><td>${esc(q.answer)}</td></tr>`;
          }).join('')}
        </tbody></table>
      </aside>
    </div>`;
    const onClick = (ev) => {
      if (!ev.target.closest('[data-action="review-mistakes"]')) return;
      const ids = result.ids.filter((id) => result.choices[id] !== questionById.get(id).answer);
      if (ids.length) startSession(ids, 'mock'); else alert('Você não errou nenhuma. Bela edição!');
    };
    main.addEventListener('click', onClick);
    teardown = () => main.removeEventListener('click', onClick);
  });

  // ------------------------------------------------------------------ patterns

  route(/^\/padroes$/, function patternsPage() {
    const specificTopics = P.topics.filter((t) => t.group === 'specific').sort((a, b) => b.n - a.n);
    const generalTopics = P.topics.filter((t) => t.group === 'general').sort((a, b) => b.n - a.n);

    const heatTable = (rows, columns, caption) => {
      const max = Math.max(1, ...rows.flatMap((t) => columns.map((e) => t.byExam[e.id] || 0)));
      return `<div class="table-wrap"><table class="table"><caption>${caption}</caption>
        <thead><tr><th>Assunto</th>${columns.map((e) => `<th>${e.year}<br><span class="fine-print">${esc(examShortLabel(e))}</span></th>`).join('')}<th>Total</th></tr></thead>
        <tbody>${rows.map((t) => `<tr><td><a href="#/estudar" data-action="study-topic" data-topic="${esc(t.id)}">${esc(t.label)}</a></td>${columns.map((e) => {
          const v = t.byExam[e.id] || 0;
          const heat = v === 0 ? '' : v / max > 0.66 ? 'heat-3' : v / max > 0.33 ? 'heat-2' : 'heat-1';
          return `<td class="${heat}">${v || '·'}</td>`;
        }).join('')}<td><b>${t.n}</b></td></tr>`).join('')}</tbody></table></div>`;
    };

    const lettersTable = `<table class="table"><thead><tr><th>Prova</th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th></tr></thead><tbody>
      ${P.letters.map((l) => {
        const e = examById.get(l.examId);
        return `<tr><td>${e.year} ${esc(examName(e))}</td>${['A', 'B', 'C', 'D', 'E'].map((x) => `<td>${x === 'E' && l.options < 5 ? '' : l.counts[x] || 0}</td>`).join('')}</tr>`;
      }).join('')}
    </tbody></table>`;

    const longest = P.longest;
    const ar = P.assertionReason;
    const OUTCOME_LABELS = {
      'both-true-justifies': 'As duas verdadeiras, e a II justifica a I',
      'both-true-no-justification': 'As duas verdadeiras, mas a II não justifica a I',
      'only-i-true': 'I verdadeira, II falsa',
      'only-ii-true': 'I falsa, II verdadeira',
      'both-false': 'As duas falsas',
      other: 'Outra redação',
    };
    const stats = myStats();
    const myFormats = Object.entries(stats.byFormat).filter(([, v]) => v.n >= 2).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n);

    main.innerHTML = `
    <div class="page grid">
      <section class="col-12">
        <p class="kicker">Análise</p>
        <h1 class="headline">O que se repete nas provas</h1>
        <p class="dek">A Gazeta leu as ${fmtNum(P.objectiveCount)} questões objetivas com gabarito e contou o que se repete: os assuntos que mais caem, os formatos de questão e as palavras que aparecem mais nas alternativas certas do que nas erradas. São tendências; confirme sempre pelo conteúdo.</p>
      </section>

      <section class="col-12 block block--thick">
        <h2 class="title">O que mais cai em Computação</h2>
        <p class="prose">Número de questões de cada assunto por prova. Quanto mais escuro, maior o peso naquele ano. Uma questão pode tratar de dois assuntos.</p>
        ${heatTable(specificTopics, exams, 'Componente específico')}
        <p class="fine-print note-below">CC: Ciência da Computação. EC: Engenharia de Computação. SI: Sistemas de Informação. ADS: Análise e Desenvolvimento de Sistemas.</p>
      </section>
      <section class="col-12 block">
        <h2 class="title-sm">Leitura rápida</h2>
        <div class="grid">
          <p class="col-4 prose prose--small">O acervo reúne as provas de Ciência da Computação, Engenharia de Computação, Sistemas de Informação e Análise e Desenvolvimento de Sistemas (tecnólogo) aplicadas a partir de 2014, quando o Enade passou a ter uma prova separada para cada curso de Computação. Cada curso é avaliado a cada três ou quatro anos, por isso há poucas edições de cada um.</p>
          <p class="col-4 prose prose--small rule-left">As provas de Engenharia de Computação puxam mais para hardware: circuitos, sistemas digitais e controle. Ciência da Computação, Sistemas de Informação e ADS concentram algoritmos, programação, banco de dados e engenharia de software.</p>
          <p class="col-4 prose prose--small rule-left">Quando o Inep publicar uma prova nova desses cursos, rode o crawler de novo e ela entra automaticamente.</p>
        </div>
      </section>

      <section class="col-12 block">
        <h2 class="title">Formação geral</h2>
        ${heatTable(generalTopics, exams, 'Formação geral (parte comum a todos os cursos, presente em cada prova)')}
      </section>

      <section class="col-12 block block--double">
        <p class="kicker">Formatos</p>
        <h2 class="title">Como as questões são montadas e como atacar cada tipo</h2>
      </section>
      ${P.formats.map((f, i) => {
        const guide = GUIDE[f.id];
        if (!guide) return '';
        const mine = stats.byFormat[f.id];
        const evidence = formatEvidence(f.id);
        return `<section class="col-4 format-card ${i % 3 ? 'rule-left' : ''}">
          <h3 class="title-sm">${esc(f.label)}</h3>
          <p class="fine-print">${plural(f.n, 'questão', 'questões')} no acervo${mine ? `; seu acerto: ${pct(mine.ok, mine.n)}%` : ''}</p>
          <p class="prose prose--small">${esc(guide.summary)}</p>
          <ul class="prose prose--small step-list">${guide.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
          ${evidence.length ? `<p class="prose prose--note">${evidence[0]}</p>` : ''}
        </section>`;
      }).join('')}

      <section class="col-12 block block--double">
        <p class="kicker">Sinais nas alternativas</p>
        <h2 class="title">Pistas estatísticas para desempatar</h2>
        <p class="fine-print">Calculadas sobre ${fmtNum(longest.n)} questões cujas alternativas são frases livres (situações de sala de aula, conceitos e interpretação).</p>
      </section>
      <section class="col-4">
        <div class="big-number">${fmtDecimal(longest.longestPct)}%</div>
        <h3 class="title-sm">das vezes a correta foi a alternativa mais longa</h3>
        <p class="prose prose--small">No puro acaso seria ${fmtDecimal(longest.chancePct)}%. A vantagem existe, mas é pequena: a correta foi a mais curta em ${fmtDecimal(longest.shortestPct)}% dos casos. Use só como último critério.</p>
      </section>
      <section class="col-4 rule-left">
        <div class="big-number">${fmtDecimal(P.absolutes.distractorPct)}% × ${fmtDecimal(P.absolutes.correctPct)}%</div>
        <h3 class="title-sm">termos absolutos nas erradas e nas corretas</h3>
        <ul class="bars bars--top">${P.absolutes.words.map((w) => `<li><span>“${esc(w.w)}”</span><span class="track"><i class="wine" style="width:${pct(w.distractor, w.distractor + w.correct)}%"></i></span><b>${w.distractor}×${w.correct}</b></li>`).join('')}</ul>
        <p class="fine-print note-below">Barra: proporção das ocorrências em alternativas erradas (erradas × corretas).</p>
      </section>
      <section class="col-4 rule-left">
        <h3 class="title-sm">Vocabulário das corretas</h3>
        <div class="word-cloud">${P.vocabulary.correct.map((v) => `<span>${esc(v.w)}<small>${v.correct}×${v.distractor}</small></span>`).join('')}</div>
        <h3 class="title-sm title-sm--spaced">Vocabulário das erradas</h3>
        <div class="word-cloud">${P.vocabulary.distractors.map((v) => `<span>${esc(v.w)}<small>${v.correct}×${v.distractor}</small></span>`).join('')}</div>
        <p class="fine-print note-below">Números: vezes em corretas × em erradas. Mais típicas das corretas: ${P.vocabulary.correct.slice(0, 3).map((v) => esc(v.w)).join(', ')}; das erradas: ${P.vocabulary.distractors.slice(0, 3).map((v) => esc(v.w)).join(', ')}.</p>
      </section>

      <section class="col-6 block">
        <h2 class="title-sm">Asserção e razão: o que costuma ser a resposta</h2>
        <ul class="bars">${Object.entries(ar.outcomes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<li><span>${esc(OUTCOME_LABELS[k] || k)}</span><span class="track"><i style="width:${pct(v, ar.n)}%"></i></span><b>${v}</b></li>`).join('')}</ul>
        <p class="fine-print note-below">Amostra pequena (${ar.n} questões): mostra só que “I falsa, II verdadeira” aparece com frequência.</p>
      </section>
      <section class="col-6 block rule-left">
        <h2 class="title-sm">A letra do gabarito não ajuda</h2>
        ${lettersTable}
        <p class="fine-print note-below">O Inep distribui as respostas de forma equilibrada entre as letras. Chutar sempre a mesma letra rende só o acaso.</p>
      </section>

      <section class="col-12 block block--double">
        <p class="kicker">Seus padrões</p>
        <h2 class="title">Onde você mais erra</h2>
        ${myFormats.length
          ? `<ul class="bars">${myFormats.map(([f, v]) => `<li><span>${esc(formatLabel(f))}</span><span class="track"><i class="${v.ok / v.n >= 0.6 ? 'olive' : 'wine'}" style="width:${pct(v.ok, v.n)}%"></i></span><b>${pct(v.ok, v.n)}% de ${v.n}</b></li>`).join('')}</ul>`
          : '<p class="prose">Responda algumas questões e esta seção mostra em quais formatos de questão você perde mais pontos.</p>'}
      </section>
    </div>`;
  });

  // ------------------------------------------------------------------ review

  route(/^\/revisao$/, function reviewPage() {
    const wrong = questions.filter((q) => statusOf(q.id) === 'wrong');
    const flagged = questions.filter((q) => state.flagged[q.id]);
    const rowsHTML = (list) => list.map((q) => {
      const e = examById.get(q.examId);
      const last = lastAttempt(q.id);
      return `<tr><td><a href="#/q/${esc(q.id)}">${e.year} ${esc(questionLabel(q))}</a></td><td>${q.topics.map((t) => esc(topicLabel(t))).join(', ')}</td><td>${last ? `${esc(last.choice)} (gabarito ${esc(q.answer)})` : ''}</td></tr>`;
    }).join('');
    main.innerHTML = `
    <div class="page grid">
      <section class="col-12">
        <p class="kicker">Revisão</p>
        <h1 class="headline">${wrong.length ? `${plural(wrong.length, 'questão espera', 'questões esperam')} por uma segunda chance` : 'Nenhum erro pendente'}</h1>
        <p class="dek">${wrong.length ? 'Refaça estas questões daqui a alguns dias. Quando você acertar, a questão sai desta lista.' : 'Quando errar uma questão, ela aparece aqui para você refazer depois.'}</p>
      </section>
      <section class="col-7 block block--thick">
        <div class="results-header"><h2 class="title no-margin">Errei na última tentativa</h2>
          ${wrong.length ? '<button class="btn" data-action="review-list" data-list="wrong">Refazer todas</button>' : ''}</div>
        ${wrong.length ? `<table class="table table--text"><thead><tr><th>Questão</th><th>Assunto</th><th>Sua resposta</th></tr></thead><tbody>${rowsHTML(wrong)}</tbody></table>` : '<p class="prose">Nada por aqui.</p>'}
      </section>
      <section class="col-5 block block--thick rule-left">
        <div class="results-header"><h2 class="title no-margin">Marcadas</h2>
          ${flagged.length ? '<button class="btn btn--light" data-action="review-list" data-list="flagged">Estudar marcadas</button>' : ''}</div>
        ${flagged.length ? `<table class="table table--text"><tbody>${rowsHTML(flagged)}</tbody></table>` : '<p class="prose">Use “Marcar para revisar” (tecla M) nas questões que quer rever com calma.</p>'}
        <div class="block block--spaced">
          <h2 class="title-sm">Recomeçar do zero</h2>
          <p class="fine-print">Apaga respostas, marcações, rascunhos e simulados guardados neste navegador.</p>
          <button class="link-btn" data-action="reset-progress">Apagar meu progresso</button>
        </div>
      </section>
    </div>`;
    const onClick = (ev) => {
      const b = ev.target.closest('[data-action]');
      if (!b) return;
      if (b.dataset.action === 'review-list') startSession((b.dataset.list === 'wrong' ? wrong : flagged).map((q) => q.id), 'review');
      if (b.dataset.action === 'reset-progress' && confirm('Apagar todo o seu progresso neste navegador? Não dá para desfazer.')) {
        const examDate = state.examDate;
        state = emptyState();
        state.examDate = examDate;
        state.filters = defaultFilters();
        save();
        navigate();
      }
    };
    main.addEventListener('click', onClick);
    teardown = () => main.removeEventListener('click', onClick);
  });

  // ------------------------------------------------------------------ sources (masthead credits)

  route(/^\/fontes$/, function sourcesPage() {
    const generatedAt = new Date(DATA.generatedAt);
    main.innerHTML = `
    <div class="page grid">
      <section class="col-12">
        <p class="kicker">Expediente</p>
        <h1 class="headline">De onde vêm as questões</h1>
        <p class="dek">Todo o conteúdo vem das páginas oficiais de provas e gabaritos do Inep. O crawler deste projeto encontra os cadernos de Computação, baixa os PDFs, recorta cada questão como imagem e lê o gabarito definitivo.</p>
      </section>
      <section class="col-8 block block--thick">
        <h2 class="title">Provas desta edição</h2>
        <div class="table-wrap"><table class="table"><thead><tr><th>Prova</th><th>Objetivas</th><th>Gabarito</th><th>Arquivos oficiais</th></tr></thead><tbody>
          ${exams.map((e) => `<tr><td><b>${e.year}</b> ${esc(examName(e))}<br><span class="fine-print">${esc(examSubtitle(e))}</span></td><td>${e.objectiveCount}</td><td>${esc(KEY_METHOD_LABELS[e.keyMethod] || e.keyMethod)}</td>
            <td><a href="${esc(e.sources.exam)}" target="_blank" rel="noopener">prova</a>, <a href="${esc(e.sources.answerKey)}" target="_blank" rel="noopener">gabarito</a>${e.sources.answerGuide ? `, <a href="${esc(e.sources.answerGuide)}" target="_blank" rel="noopener">padrão de resposta</a>` : ''}${e.sources.testMap ? `, <a href="${esc(e.sources.testMap)}" target="_blank" rel="noopener">mapa</a>` : ''}<br><a class="fine-print" href="${esc(e.sources.page)}" target="_blank" rel="noopener">página do Inep</a></td></tr>`).join('')}
        </tbody></table></div>
      </section>
      <aside class="col-4 block block--thick rule-left prose prose--small">
        <h2 class="title-sm">Notas da redação</h2>
        <p>As questões aparecem como recortes do caderno 1 de cada prova, sem nenhuma alteração. O texto extraído serve apenas para busca e classificação.</p>
        <p>Só entram provas de Ciência da Computação, Engenharia de Computação, Sistemas de Informação e Análise e Desenvolvimento de Sistemas, de 2014 em diante. As questões de formação geral que aparecem aqui fazem parte dessas mesmas provas.</p>
        <p>Assuntos e formatos foram classificados por palavras-chave, com revisão manual (<code>crawler/overrides.json</code>). Discorda de algum? Edite o arquivo e rode o crawler.</p>
        <p class="fine-print">Dados gerados em ${shortDate(generatedAt)} às ${shortTime(generatedAt)}. Para atualizar: <code>npm run crawl</code>.</p>
      </aside>
    </div>`;
  });

  // ------------------------------------------------------------------ global actions (front page, patterns, study list)

  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-action]');
    if (!b) return;
    const action = b.dataset.action;
    if (action === 'study-topic') {
      ev.preventDefault();
      state.filters = { ...defaultFilters(), topics: [b.dataset.topic] };
      save();
      startSession(applyFilters(state.filters).map((q) => q.id));
    } else if (action === 'study-exam') {
      ev.preventDefault();
      state.filters = { ...defaultFilters(), exams: [b.dataset.exam] };
      save();
      location.hash = '#/estudar';
    } else if (action === 'start-all') {
      state.filters = defaultFilters();
      save();
    } else if (action === 'clear-filters') {
      state.filters = defaultFilters();
      save();
      navigate();
    } else if (action === 'start-session') {
      startSession(applyFilters({ ...state.filters, order: b.dataset.order }).map((q) => q.id));
    } else if (action === 'open-from-list') {
      ev.preventDefault();
      const ids = applyFilters({ ...state.filters, order: 'exam' }).map((q) => q.id);
      state.session = { ids, idx: ids.indexOf(b.dataset.id), origin: 'study' };
      save();
      location.hash = '#/q/' + b.dataset.id;
    }
  });

  // ------------------------------------------------------------------ boot

  document.getElementById('today').textContent = longDate(new Date()).replace(/^./, (c) => c.toUpperCase());
  document.getElementById('edition').textContent = `Edição de estudos nº ${myStats().days + 1}`;
  document.getElementById('tagline-stats').textContent = `${plural(exams.length, 'prova', 'provas')}, ${fmtNum(objectives.length)} questões objetivas`;
  document.getElementById('footer-updated').textContent = `Atualizado em ${shortDate(DATA.generatedAt)}`;
  window.addEventListener('hashchange', navigate);
  navigate();
})();
