// Detects each question's format and computes pattern statistics over the real tests.
import { normText, TOPICS } from './taxonomy.js';

// format id -> label shown in the interface (Portuguese)
export const FORMATS = {
  'assertion-reason': 'Asserção e razão',
  statements: 'Avalie as afirmativas (I, II, III…)',
  'true-false': 'Verdadeiro ou falso (sequência V/F)',
  matching: 'Associação ou ordenação',
  code: 'Código, consulta ou pseudocódigo',
  calculation: 'Cálculo ou resultado numérico',
  'classroom-scenario': 'Situação de sala de aula',
  interpretation: 'Interpretação de texto, gráfico ou imagem',
  conceptual: 'Conceito direto',
};

// formats whose alternatives are free-form sentences (where length and wording can be compared)
const FREE_TEXT_FORMATS = ['classroom-scenario', 'conceptual', 'interpretation'];

// alternatives such as "I, apenas." / "I e III." / "I, II e IV."
const ROMAN_ALTERNATIVE = /^(I|II|III|IV|V|VI)(\s*(,|e)\s*(I|II|III|IV|V|VI))*\s*(,\s*apenas)?\.?$/;

export function detectFormat(q) {
  const alts = q.alternatives.map((a) => a.text.trim());
  const statementN = normText(q.statement);
  const altsN = alts.map(normText);
  const mostAlts = (pred) => alts.length && alts.filter(pred).length >= alts.length - 1;

  if (altsN.some((a) => /as assercoes i e ii/.test(a)) || (/\bPORQUE\b/.test(q.statement) && /assercoes/.test(statementN))) return 'assertion-reason';
  if (mostAlts((a) => ROMAN_ALTERNATIVE.test(a.replace(/\s+/g, ' ')))) return 'statements';
  if (mostAlts((a) => /^([VF]\s*[-–,]?\s*){3,}\.?$/.test(a))) return 'true-false';
  if (mostAlts((a) => /^(\d\s*[-–)]\s*[a-zA-Z]|[A-Z]{1,2}(\s*,\s*[A-Z]{1,2}){2,}\.?$|[IVX]+\s*[-–]\s*[a-z0-9])/.test(a))) return 'matching';

  // code: an explicit phrase in the statement, at least two syntax signals, or alternatives containing code/SQL
  const phrase = /(trecho de codigo|codigo a seguir|codigo-fonte|pseudocodigo|programa a seguir|funcao a seguir|algoritmo a seguir|consulta sql|em linguagem c\b|em python\b|em java\b)/;
  const syntax = statementN.match(/\bprintf\b|\bscanf\b|\bdef \w+\(|\bint \w+\s*[=;(]|\bwhile\s*\(|\bfor\s*\(|\breturn\b|\bpublic (class|void)|\bvoid \w+\s*\(|\bselect\b[\s\S]{1,80}\bfrom\b|\bfimpara\b|\bfimse\b|\+\+|==|!=/g) || [];
  const codeAlts = altsN.filter((a) => /\bselect\b[\s\S]*\bfrom\b|[{}]|\breturn\b|\w\(\s*\)/.test(a)).length;
  if (phrase.test(statementN) || new Set(syntax).size >= 2 || codeAlts >= 2) return 'code';

  if (mostAlts((a) => /^[\s\dR$.,%+\-−×x*/=()ΩµμmkMGHzVAWsbBpPº°]+\.?$/.test(a) && /\d/.test(a))) return 'calculation';

  if (/\b(professora?|docentes?|escolas?|estudantes|alunos|turma|sala de aula)\b/.test(statementN) && q.year >= 2024) return 'classroom-scenario';
  if (/\b(texto|grafico|figura|imagem|tirinha|charge|infografico|tabela)\b/.test(statementN) || /disponivel em/.test(statementN)) return 'interpretation';
  return 'conceptual';
}

/** Negative commands ("assinale a INCORRETA", "EXCETO") are a classic trap. */
export function isNegativeCommand(statement) {
  const tail = statement.slice(-400);
  return /\b(INCORRETA|INCORRETO|EXCETO|NÃO|FALSA|ERRADA)\b/.test(tail) || /\b(incorreta|exceto)\b/.test(normText(tail));
}

// Portuguese stop words, plus statement/citation boilerplate that says nothing about the topic.
const STOP_WORDS = new Set(('a o e de da do das dos em no na nos nas um uma uns umas para por com sem que se ao aos as os sua seu suas seus ' +
  'como mais ou sobre entre ja sao ser sendo foi pelo pela pelos pelas este esta esse essa isso isto nao sim ' +
  'cada tem ter mesmo quando onde qual quais seus muito pode podem forma meio partir ainda tambem apenas assim ' +
  'deve devem estao esta sera seria fim modo ' +
  'disponivel https http acesso adaptado avalie seguir seguinte considere considerando afirmar afirma afirmacoes ' +
  'correto correta texto textos questao questoes figura nessas nesses nessa nesse estar igual possua quantidade ' +
  'utilizando especialmente associado assegurar opcao alternativa apresentada apresentado apresenta informacoes ' +
  'formas diversos novos relacionados relacionadas etapas respeito outros outras sobre todos todas ' +
  'elementos sistema sistemas recursos revelam brasil brasileira brasileiro seguintes possivel situacao ' +
  'utilizado utilizada utilizar contexto acordo exemplo partir diante').split(' '));

function words(s) {
  return normText(s).replace(/[^a-z\s-]/g, ' ').split(/\s+/).filter((w) => w.length >= 5 && !STOP_WORDS.has(w));
}

// Absolute/restrictive Portuguese words, which tend to show up in distractors.
const ABSOLUTE_WORDS = ['sempre', 'nunca', 'somente', 'apenas', 'exclusivamente', 'unicamente', 'todos', 'todas', 'nenhum', 'nenhuma', 'jamais', 'necessariamente', 'garante', 'garantir', 'impede', 'elimina', 'eliminar', 'independentemente', 'qualquer'];

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

/** Maps accent-free form -> most common original form ("ordenacao" -> "ordenação"), for display. */
function accentMap(questions) {
  const counts = {};
  for (const q of questions) {
    const text = [q.statement, ...q.alternatives.map((a) => a.text)].join(' ').toLowerCase();
    for (const w of text.match(/[a-zà-ÿ-]{5,}/g) || []) {
      const k = normText(w);
      counts[k] = counts[k] || {};
      counts[k][w] = (counts[k][w] || 0) + 1;
    }
  }
  return (k) => {
    const c = counts[k];
    return c ? Object.entries(c).sort((a, b) => b[1] - a[1])[0][0] : k;
  };
}

export function computeStats(questions, exams) {
  const objective = questions.filter((q) => q.kind === 'objective' && q.answer);
  const out = { total: questions.length, objectiveCount: objective.length };
  const display = accentMap(questions);

  // 1. answer-letter distribution per exam
  out.letters = exams.map((e) => {
    const qs = objective.filter((q) => q.examId === e.id);
    const counts = {};
    for (const q of qs) counts[q.answer] = (counts[q.answer] || 0) + 1;
    return { examId: e.id, n: qs.length, options: e.options, counts };
  });

  // 2. formats
  const formatCounts = {};
  for (const q of questions.filter((q) => q.kind === 'objective')) formatCounts[q.format] = (formatCounts[q.format] || 0) + 1;
  out.formats = Object.entries(formatCounts).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, label: FORMATS[id], n }));

  // 3. longest alternative (only where alternatives are free-form sentences)
  const free = objective.filter((q) => FREE_TEXT_FORMATS.includes(q.format) && q.alternatives.length >= 4);
  let longest = 0, shortest = 0, chance = 0;
  for (const q of free) {
    const lengths = q.alternatives.map((a) => a.text.length);
    const correctLength = lengths[q.alternatives.findIndex((a) => a.letter === q.answer)];
    if (correctLength === Math.max(...lengths)) longest++;
    if (correctLength === Math.min(...lengths)) shortest++;
    chance += 1 / q.alternatives.length;
  }
  out.longest = { n: free.length, longest, shortest, longestPct: pct(longest, free.length), shortestPct: pct(shortest, free.length), chancePct: pct(chance, free.length) };

  // 4. absolute words: presence in correct alternatives vs. distractors
  let correctWith = 0, correctTotal = 0, wrongWith = 0, wrongTotal = 0;
  const wordCounts = {};
  for (const q of free) {
    for (const a of q.alternatives) {
      const t = normText(a.text);
      const hits = ABSOLUTE_WORDS.filter((w) => new RegExp('\\b' + w + '\\b').test(t));
      const isCorrect = a.letter === q.answer;
      if (isCorrect) { correctTotal++; if (hits.length) correctWith++; }
      else { wrongTotal++; if (hits.length) wrongWith++; }
      for (const h of hits) {
        wordCounts[h] = wordCounts[h] || { correct: 0, distractor: 0 };
        wordCounts[h][isCorrect ? 'correct' : 'distractor']++;
      }
    }
  }
  out.absolutes = {
    correctPct: pct(correctWith, correctTotal), distractorPct: pct(wrongWith, wrongTotal), correct: correctTotal, distractors: wrongTotal,
    words: Object.entries(wordCounts).map(([w, c]) => ({ w, ...c })).filter((x) => x.correct + x.distractor >= 3).sort((a, b) => b.correct + b.distractor - (a.correct + a.distractor)),
  };

  // 5. vocabulary: terms over-represented in correct alternatives vs. distractors (smoothed log-odds)
  const inCorrect = {}, inWrong = {};
  let correctWords = 0, wrongWords = 0;
  for (const q of free) {
    for (const a of q.alternatives) {
      for (const w of new Set(words(a.text))) {
        if (a.letter === q.answer) { inCorrect[w] = (inCorrect[w] || 0) + 1; correctWords++; }
        else { inWrong[w] = (inWrong[w] || 0) + 1; wrongWords++; }
      }
    }
  }
  const vocabulary = [...new Set([...Object.keys(inCorrect), ...Object.keys(inWrong)])]
    .map((w) => {
      const c = inCorrect[w] || 0, d = inWrong[w] || 0;
      const logOdds = Math.log((c + 0.5) / (correctWords - c + 0.5)) - Math.log((d + 0.5) / (wrongWords - d + 0.5));
      return { w, correct: c, distractor: d, logOdds: Math.round(logOdds * 100) / 100 };
    })
    .filter((x) => x.correct + x.distractor >= 6);
  out.vocabulary = {
    correct: vocabulary.filter((x) => x.logOdds > 0 && x.correct >= 4).sort((a, b) => b.logOdds - a.logOdds).slice(0, 18).map((x) => ({ ...x, w: display(x.w) })),
    distractors: vocabulary.filter((x) => x.logOdds < 0 && x.distractor >= 6).sort((a, b) => a.logOdds - b.logOdds).slice(0, 18).map((x) => ({ ...x, w: display(x.w) })),
  };

  // 6. "evaluate the statements": how many statements tend to be true
  const statementQs = objective.filter((q) => q.format === 'statements');
  const byCount = {};
  for (const q of statementQs) {
    const t = q.alternatives.find((a) => a.letter === q.answer)?.text.replace(/[.,]|apenas/g, '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    const n = t.split(/\s*(?:,|e)\s*/).filter(Boolean).length;
    byCount[n] = (byCount[n] || 0) + 1;
  }
  out.statements = { n: statementQs.length, byCount };

  // 7. assertion-reason: which canonical outcome was the answer (matched against INEP's fixed wording)
  const arQs = objective.filter((q) => q.format === 'assertion-reason');
  const outcomes = {};
  for (const q of arQs) {
    const t = normText(q.alternatives.find((a) => a.letter === q.answer)?.text || '');
    let k = 'other';
    if (/sao proposicoes verdadeiras, e a ii e uma justi\s*fica\s*ti\s*va/.test(t)) k = 'both-true-justifies';
    else if (/sao proposicoes verdadeiras, mas a ii nao/.test(t)) k = 'both-true-no-justification';
    else if (/a assercao i e uma proposicao verdadeira, e a ii e uma proposicao falsa/.test(t)) k = 'only-i-true';
    else if (/a assercao i e uma proposicao falsa, e a ii e uma proposicao verdadeira/.test(t)) k = 'only-ii-true';
    else if (/sao proposicoes falsas/.test(t)) k = 'both-false';
    outcomes[k] = (outcomes[k] || 0) + 1;
  }
  out.assertionReason = { n: arQs.length, outcomes };

  // 8. negative commands
  out.negatives = { n: objective.filter((q) => q.negative).length };

  // 9. topics per exam + recurring terms per topic
  out.topics = Object.entries(TOPICS).map(([id, t]) => {
    const qs = questions.filter((q) => q.topics.includes(id));
    const byExam = Object.fromEntries(exams.map((e) => [e.id, qs.filter((q) => q.examId === e.id).length]));
    return { id, label: t.label, group: t.group, n: qs.length, byExam };
  }).filter((t) => t.n > 0);

  const docFreq = {};
  const termFreqByTopic = {};
  for (const q of questions) {
    const ws = new Set(words(q.statement + ' ' + q.alternatives.map((a) => a.text).join(' ')));
    for (const w of ws) docFreq[w] = (docFreq[w] || 0) + 1;
    for (const t of q.topics) {
      termFreqByTopic[t] = termFreqByTopic[t] || {};
      for (const w of ws) termFreqByTopic[t][w] = (termFreqByTopic[t][w] || 0) + 1;
    }
  }
  const N = questions.length;
  out.topicTerms = Object.fromEntries(Object.entries(termFreqByTopic).map(([t, freq]) => {
    const n = questions.filter((q) => q.topics.includes(t)).length;
    // tf-idf: frequent within the topic, rare elsewhere
    const ranked = Object.entries(freq)
      .filter(([, c]) => c >= 2 && c / n >= 0.12)
      .map(([w, c]) => [w, (c / n) * Math.log(N / docFreq[w])])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([w]) => display(w));
    return [t, ranked];
  }));

  return out;
}
