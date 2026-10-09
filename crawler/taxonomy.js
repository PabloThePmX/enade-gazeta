// Topics used by the filters. Automatic classification matches keywords against the extracted text;
// manual corrections live in crawler/overrides.json (they always win).
//
// `label` is shown in the interface (Portuguese). `keywords` are regexes matched against the
// questions' accent-free, lower-cased Portuguese text.

export const TOPICS = {
  // Specific component (computing)
  algorithms: { label: 'Algoritmos e estruturas de dados', group: 'specific', keywords: ['algoritmos? de (ordenacao|busca)', 'ordenacao', 'quicksort', 'bubble ?sort', 'merge ?sort', 'insertion ?sort', 'busca binaria', 'busca (gulosa|em largura|em profundidade|de custo uniforme)', 'a\\*', 'pilha', 'fila de prioridade', 'arvores?( binaria| avl| b)?', 'lista encadeada', 'tabela hash', 'hash', 'estruturas? de dados', 'heap', 'dijkstra', 'caminho (minimo|mais curto)', 'complexidade', 'programacao dinamica', 'divisao e conquista', 'guloso', 'subsequencia', 'notacao o', 'recursiv', 'vetor(es)?'] },
  programming: { label: 'Programação e linguagens', group: 'specific', keywords: ['linguagens? de programacao', 'programacao', 'codigo(-fonte)?', 'pseudocodigo', 'funcao recursiva', 'variave(l|is)', 'lacos? de repeticao', 'estrutura(s)? de (repeticao|decisao|controle)', 'python', 'java\\b', 'linguagem c\\b', 'compilador', 'interpretador', 'orientad[ao] a objetos', 'classes?\\b', 'heranca', 'polimorfismo', 'encapsulamento', 'paradigma', 'depuracao', 'printf', 'return'] },
  theory: { label: 'Teoria da computação e matemática discreta', group: 'specific', keywords: ['automato', 'gramatica', 'linguagens? regular', 'maquina de turing', 'decidi', 'np-complet', 'logica proposicional', 'tabela-verdade', 'tabela verdade', 'relac(ao|oes) de equivalencia', 'teoria dos conjuntos', 'conjuntos?\\b', 'inducao matematica', 'combinatoria', 'grafos?\\b', 'vertices?', 'arestas?', 'analisador (lexico|sintatico|semantico)'] },
  architecture: { label: 'Arquitetura, circuitos e sistemas digitais', group: 'specific', keywords: ['processador', 'cpu', 'memoria cache', 'cache', 'registradores?', 'pipeline', 'circuitos?', 'portas? logicas?', 'flip-flop', 'microcontrolador', 'arduino', 'resistor', 'tensao', 'corrente eletrica', 'transistor', 'sistemas? digita', 'fpga', 'barramento', 'assembly', 'hexadecimal', 'arquitetura de computadores', 'von neumann', 'hardware', 'sensor', 'conversor', 'amplificador', 'capacitor', 'portas? (and|or|xor|not|nand)', 'embarcad'] },
  'operating-systems': { label: 'Sistemas operacionais', group: 'specific', keywords: ['sistemas? operaciona', 'escalonamento', 'escalonador', 'processos (em execucao|concorrentes|prontos)', 'threads?', 'deadlock', 'impasse', 'starvation', 'race condition', 'condicao de corrida', 'memoria virtual', 'paginacao', 'round robin', 'fifo', 'sjf', 'kernel', 'preempc', 'troca de contexto', 'chamada de sistema', 'sistemas? de arquivos', 'semaforo', 'exclusao mutua', 'virtualizacao', 'maquinas? virtua'] },
  networks: { label: 'Redes de computadores', group: 'specific', keywords: ['redes? de computadores', 'protocolos?', '\\btcp', '\\budp', 'enderec(o|amento) ip', '\\bipv[46]', 'roteamento', 'roteador', 'ospf', '\\bdns', '\\bhttps?\\b', 'camadas?', 'modelo osi', 'switch', 'wi-?fi', 'ethernet', 'sub-?rede', 'mascara', 'wireshark', 'pacotes?', 'largura de banda', 'internet das coisas', '\\biot\\b'] },
  databases: { label: 'Banco de dados', group: 'specific', keywords: ['bancos? de dados', '\\bsql', '\\bselect\\b', 'relaciona(l|mento)', 'entidade', 'normaliza', 'chave primaria', 'chave estrangeira', 'transac', '\\bsgbd', 'nosql', 'consulta', 'tabelas?'] },
  'software-engineering': { label: 'Engenharia de software', group: 'specific', keywords: ['requisitos?', '\\buml\\b', 'diagrama de (classes|casos de uso|sequencia)', 'casos? de uso', 'scrum', 'ageis', 'agil', 'testes? de software', 'teste unitario', 'manutencao de software', 'arquitetura de software', 'padroes? de projeto', 'versionamento', '\\bgit\\b', 'qualidade de software', 'engenharia de software', 'modelagem', 'kanban', 'sprint', 'requisitos? nao funciona', 'microsservic', 'portabilidade', 'confiabilidade'] },
  ai: { label: 'Inteligência artificial e dados', group: 'specific', keywords: ['inteligencia artificial', '\\bia\\b', 'aprendizado de maquina', 'machine learning', 'redes? neura', 'ia generativa', 'generativa', 'aprendizado (supervisionado|nao supervisionado|por reforco)', 'supervisionad', 'clusteriza', 'agrupamento', 'big data', 'mineracao de dados', 'ciencia de dados', 'chatgpt', 'modelos? de linguagem', 'algoritmos? de recomendacao', 'vies algoritmico'] },
  security: { label: 'Segurança da informação', group: 'specific', keywords: ['seguranca da informacao', 'criptografia', 'ataques?', 'malware', 'virus', 'senhas?', 'autenticacao', 'privacidade', '\\blgpd', 'firewall', 'phishing', 'vulnerabilidade', 'controle de acesso', 'permiss(ao|oes) de acesso', 'backup'] },
  hci: { label: 'IHC, acessibilidade e interfaces', group: 'specific', keywords: ['usabilidade', '\\bihc\\b', 'interacao humano', 'experiencia do usuario', '\\bux\\b', 'interfaces?', 'acessibilidade', 'acessive(l|is)', 'tecnologias? assistivas?', 'deficiencia visual', 'baixa visao', '\\bwcag', 'heuristica', 'computacao grafica', 'imagem digital', 'pixel', 'design de interface'] },
  math: { label: 'Matemática, física, estatística e otimização', group: 'specific', keywords: ['programacao linear', 'pesquisa operacional', 'funcao objetivo', 'otimizac', 'derivada', 'integral', 'equac(ao|oes) diferencia', 'transformada', 'laplace', 'fourier', 'sinais?\b', 'sistemas? de controle', 'controlador', 'funcao de transferencia', 'probabilidade', 'estatistica', 'media aritmetica', 'desvio padrao', 'mediana', 'quartil', 'variancia', 'dispersao', 'regressao linear', 'minimos quadrados', 'multiplicador de lagrange', 'matriz', 'calculo numerico', 'frequencia', 'amostragem', 'temperatura', 'calor', 'pressao', 'deformacao', 'elasticidade', 'corpo de prova', 'resfriamento', 'energia'] },
  'information-systems': { label: 'Sistemas de informação e gestão de TI', group: 'specific', keywords: ['governanca', '\bcobit', '\bitil', '\bbpm', 'processos? de negocio', 'modelagem de processos', '\bpmbok', 'gerenciamento de projetos?', 'gestao de projetos?', '\bcmmi', 'nivel de maturidade', '\berp\b', '\bcrm\b', 'balanced scorecard', 'sistemas? de informac', 'sistemas? de apoio a decisao', 'business intelligence', 'alinhamento estrategico', 'tecnologia da informacao', '\bti\b', 'organizac', 'stakeholders?', 'cronograma', 'escopo do projeto'] },
  ethics: { label: 'Computação, ética e sociedade', group: 'specific', keywords: ['fake news', 'desinformacao', 'etica', 'cidadania digital', 'inclusao digital', 'exclusao digital', 'impactos? (sociais|da tecnologia)', 'direitos autorais', 'cultura digital', 'redes sociais', 'letramento digital'] },

  // General education
  'ge-teaching': { label: 'Didática, currículo e avaliação', group: 'general', keywords: ['didatica', 'curriculo', 'avaliacao', 'aprendizagem', 'ensino', 'planejamento', 'metodologia', 'pedagog', 'professor', 'docente', 'sala de aula', 'escola', 'estudantes', 'projeto pedagogico', 'escola nova', 'teorias? pedagogicas'] },
  'ge-inclusion': { label: 'Inclusão, diversidade e direitos humanos', group: 'general', keywords: ['inclusao', 'inclusiva', 'deficiencia', 'surd', 'libras', 'autis', '\\btea\\b', 'altas habilidades', 'indigena', 'quilombola', 'genero', 'racismo', 'etnico-racia', 'interseccionalidade', 'diversidade', 'direitos humanos', 'violencia', 'mulher', 'lgbt', 'africanas?', 'idosos?', 'discriminacao'] },
  'ge-policy': { label: 'Políticas e legislação educacional', group: 'general', keywords: ['\\blei\\b', '\\bldb\\b', 'diretrizes', '\\bpne\\b', '\\bpnld\\b', 'fundeb', 'politicas? publicas?', 'politicas? educaciona', 'estatuto', '\\beca\\b', 'constituicao', 'gestao democratica', 'conselho escolar', 'censo escolar', 'indicadores?'] },
  'ge-environment': { label: 'Meio ambiente e sustentabilidade', group: 'general', keywords: ['ambienta', 'sustentab', 'clima', 'climatic', 'desmatamento', 'residuos', 'compostagem', 'energia renova', 'agua', 'aquecimento global', 'biodiversidade', 'poluic'] },
  'ge-society': { label: 'Sociedade, economia e cidadania', group: 'general', keywords: ['desigualdade', 'pobreza', 'fome', 'inseguranca alimentar', 'trabalho', 'emprego', 'renda', 'economia', 'cidadania', 'democracia', 'saude', 'populacao', 'urban', 'cidades', 'carceraria', 'migra', 'mobilidade', 'vacina'] },
  'ge-science-culture': { label: 'Ciência, tecnologia e cultura', group: 'general', keywords: ['ciencia', 'cientific', 'tecnologia', 'inteligencia artificial', 'digital', 'internet', 'arte', 'cultura', 'literatura', 'cinema', 'musica', 'leitura', 'midia', 'desinformacao'] },
};

const FALLBACK = { general: 'ge-society', specific: 'programming' };

const normText = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const compiled = Object.fromEntries(
  Object.entries(TOPICS).map(([id, t]) => [id, t.keywords.map((k) => new RegExp('(^|[^a-z])' + k, 'g'))]),
);

/** Returns up to 2 topics of the given group ('general' | 'specific') with the highest score. */
export function classify(text, group) {
  const t = normText(text);
  const scores = [];
  for (const [id, regexes] of Object.entries(compiled)) {
    if (TOPICS[id].group !== group) continue;
    let score = 0;
    regexes.forEach((re, i) => {
      const n = (t.match(re) || []).length;
      // more specific terms (at the start of the list) weigh more; repetition has diminishing returns
      if (n) score += (i < 6 ? 3 : 2) * Math.min(3, n) ** 0.7;
    });
    if (score > 0) scores.push([id, score]);
  }
  scores.sort((a, b) => b[1] - a[1]);
  if (!scores.length) return [FALLBACK[group]];
  const top = scores[0][1];
  return scores.filter(([, s], i) => i === 0 || (i < 2 && s >= top * 0.6 && s >= 4)).map(([id]) => id);
}

export { normText };
