# Enade Gazeta

<p align="center">
  <a href="#en"><b>English</b></a> &nbsp;|&nbsp; <a href="#pt-br"><b>Português (Brasil)</b></a>
</p>

---

<a id="en"></a>

<h2 align="center">English</h2>

[Getting started](#en-getting-started) · [What the crawler does](#en-crawler) · [Current collection](#en-collection) · [Project layout](#en-layout)

A study site for the computing exams of Enade, Brazil's national assessment of undergraduate courses. It uses INEP's official tests from 2014 onwards for Ciência da Computação, Engenharia de Computação, Sistemas de Informação and the Análise e Desenvolvimento de Sistemas technology degree. 2014 is the first year Enade gave each computing course its own test; from 2005 to 2011 there was a single "Computação" test for the whole area. A crawler finds the test booklets and answer keys on INEP's site, crops each question from the PDF and tags it with a topic and a question format. The interface is in Brazilian Portuguese and is styled like a newspaper. You can solve questions with filters, take timed mock exams and look at the patterns found across the tests.

<a id="en-getting-started"></a>

### Getting started

```bash
npm install
npm run crawl     # downloads the tests from INEP and generates public/data + public/img (a few minutes)
npm start         # serves the app at http://localhost:5173
npm test          # smoke test in the locally installed Chrome (opens public/index.html directly)
```

You can also open `public/index.html` in the browser without running the server.

Answers, flagged questions, essay drafts and mock exam results are saved in the browser's `localStorage`.

<a id="en-crawler"></a>

### What the crawler does

1. Reads the `provas-e-gabaritos/<year>` pages in INEP's Enade section, from 2014 through the current year, and collects the PDF links. Up to 2019 INEP files booklets, answer keys and essay guides in separate folders with abbreviated names; from 2021 the type is part of the file name. The crawler handles both.
2. Keeps only the tests for Ciência da Computação, Engenharia de Computação, Sistemas de Informação and Análise e Desenvolvimento de Sistemas (and Engenharia de Software, if INEP ever publishes it). Teaching degrees, other technology degrees and other courses are skipped. The general education questions ("Formação Geral") shown in the app are the ones printed in these same tests.
3. Downloads booklet 1 and the final answer key into `data/raw/`, skipping files it already has.
4. Finds the "QUESTÃO NN" headers in the PDF's positioned text, follows two-column pages and shared base texts ("Texto para as questões 31 a 33"), and crops each question from the rendered page. The app shows these crops, so every question looks the way it does in the booklet. The extracted text is used for search and classification only. The 2017 booklets embed the Calibri font without a character map; `crawler/calibri-glyph-ids.json` translates their glyph numbers back into text.
5. Reads the answer key, which INEP publishes as a list, a grid or an image. If a key is only an image, its transcription goes in `crawler/manual-answer-keys.json`.
6. Tags each question with a topic and a format (assertion-reason, "evaluate the statements", code, calculation and others) by keyword matching. Manual corrections go in `crawler/overrides.json`.
7. Computes statistics over the real alternatives: how often each topic appears per test, how often absolute words such as "todos" and "sempre" appear in correct and wrong alternatives, which words show up more in correct alternatives, the answer distribution for assertion-reason and statement questions, and the spread of answer letters.

To limit the years, run `npm run crawl -- --years=2017-2021`. To reprocess text and classification without re-rendering the crops, run `npm run crawl -- --no-images`.

When INEP publishes a new test for one of these courses, run `npm run crawl` again. If the new answer key is only an image, the crawler prints a warning; add the transcription to `crawler/manual-answer-keys.json`. `node crawler/render-page.js <pdf> <dir>` renders the page as a PNG so you can read it.

`npm run crawl` runs Node with `--use-system-ca`, because INEP's HTTPS certificate fails Node's built-in check, and it retries when INEP's server drops a download.

<a id="en-collection"></a>

### Current collection

| Year | Test | Objective questions |
| --- | --- | --- |
| 2014 | Ciência da Computação | 35 |
| 2014 | Engenharia de Computação | 35 (3 annulled) |
| 2014 | Sistemas de Informação | 35 |
| 2014 | Análise e Desenvolvimento de Sistemas | 35 |
| 2017 | Ciência da Computação | 35 |
| 2017 | Engenharia de Computação | 35 |
| 2017 | Sistemas de Informação | 35 (1 annulled) |
| 2017 | Análise e Desenvolvimento de Sistemas | 35 (1 annulled) |
| 2019 | Engenharia de Computação | 35 (1 annulled) |
| 2021 | Ciência da Computação | 35 (2 annulled) |
| 2021 | Sistemas de Informação | 35 (1 annulled) |
| 2021 | Análise e Desenvolvimento de Sistemas | 35 |
| 2023 | Engenharia de Computação | 38 |

Each test has 8 or 9 general education questions; the rest are specific to the course. Enade assesses each course every three or four years, so 2015, 2016, 2018, 2020, 2022 and 2024 to 2026 have no test for these courses.

<a id="en-layout"></a>

### Project layout

```
crawler/   discovery, download, extraction (pdf.js + canvas), answer keys, classification and patterns
public/    the site (plain HTML/CSS/JS, no framework) plus the generated data
tests/     Chrome smoke test (npm test)
```

*The questions and answer keys belong to INEP and are reproduced here for personal study.*

[Back to top](#enade-gazeta)

---

<a id="pt-br"></a>

<h2 align="center">Português (Brasil)</h2>

[Como começar](#pt-como-comecar) · [O que o crawler faz](#pt-crawler) · [Provas disponíveis](#pt-provas) · [Estrutura do projeto](#pt-estrutura)

Um site de estudo para as provas de Computação do Enade, feito com as provas oficiais do Inep de 2014 em diante de Ciência da Computação, Engenharia de Computação, Sistemas de Informação e do tecnólogo em Análise e Desenvolvimento de Sistemas. 2014 foi o primeiro ano em que o Enade deu uma prova própria a cada curso de Computação; de 2005 a 2011 havia uma única prova de "Computação" para toda a área. Um crawler encontra os cadernos de prova e os gabaritos no site do Inep, recorta cada questão do PDF e classifica cada uma por assunto e formato. A interface é em português e tem cara de jornal. Dá para resolver questões com filtros, fazer simulados com tempo e ver os padrões encontrados nas provas.

<a id="pt-como-comecar"></a>

### Como começar

```bash
npm install
npm run crawl     # baixa as provas do Inep e gera public/data + public/img (leva alguns minutos)
npm start         # abre o site em http://localhost:5173
npm test          # teste rápido no Chrome instalado (abre o public/index.html direto)
```

Também dá para abrir o `public/index.html` direto no navegador, sem rodar o servidor.

Respostas, questões marcadas, rascunhos das discursivas e resultados dos simulados ficam salvos no `localStorage` do navegador.

<a id="pt-crawler"></a>

### O que o crawler faz

1. Lê as páginas `provas-e-gabaritos/<ano>` da seção do Enade no site do Inep, de 2014 até o ano atual, e junta os links dos PDFs. Até 2019 o Inep guarda cadernos, gabaritos e padrões de resposta em pastas separadas, com nomes abreviados; a partir de 2021 o tipo vem no nome do arquivo. O crawler entende os dois formatos.
2. Fica só com as provas de Ciência da Computação, Engenharia de Computação, Sistemas de Informação e Análise e Desenvolvimento de Sistemas (e Engenharia de Software, se o Inep um dia publicar). Licenciaturas, outros tecnólogos e outros cursos ficam de fora. As questões de Formação Geral que aparecem no site são as que estão nessas mesmas provas.
3. Baixa o caderno 1 e o gabarito definitivo para `data/raw/`, pulando os arquivos que já existem.
4. Procura os cabeçalhos "QUESTÃO NN" no texto posicionado do PDF, acompanha páginas em duas colunas e textos-base compartilhados ("Texto para as questões 31 a 33") e recorta cada questão da página renderizada. O site mostra esses recortes, então cada questão aparece como no caderno. O texto extraído serve só para busca e classificação. Os cadernos de 2017 embutem a fonte Calibri sem mapa de caracteres; o arquivo `crawler/calibri-glyph-ids.json` traduz os números dos glifos de volta para texto.
5. Lê o gabarito, que o Inep publica como lista, como grade ou como imagem. Se um gabarito vier só como imagem, a transcrição dele vai em `crawler/manual-answer-keys.json`.
6. Marca cada questão com um assunto e um formato (asserção-razão, "avalie as afirmativas", código, cálculo e outros) por palavras-chave. As correções manuais ficam em `crawler/overrides.json`.
7. Calcula estatísticas sobre as alternativas reais: quantas vezes cada assunto aparece por prova, com que frequência palavras absolutas como "todos" e "sempre" aparecem nas alternativas certas e nas erradas, quais palavras aparecem mais nas alternativas certas, a distribuição das respostas em asserção-razão e em afirmativas, e a distribuição das letras do gabarito.

Para limitar os anos, rode `npm run crawl -- --years=2017-2021`. Para reprocessar texto e classificação sem gerar os recortes de novo, rode `npm run crawl -- --no-images`.

Quando o Inep publicar uma prova nova de um desses cursos, rode `npm run crawl` de novo. Se o gabarito novo vier só como imagem, o crawler avisa; adicione a transcrição em `crawler/manual-answer-keys.json`. O comando `node crawler/render-page.js <pdf> <pasta>` gera um PNG da página para você ler.

O `npm run crawl` roda o Node com `--use-system-ca`, porque o certificado HTTPS do Inep não passa na verificação padrão do Node, e tenta de novo quando o servidor do Inep derruba um download.

<a id="pt-provas"></a>

### Provas disponíveis

| Ano | Prova | Questões objetivas |
| --- | --- | --- |
| 2014 | Ciência da Computação | 35 |
| 2014 | Engenharia de Computação | 35 (3 anuladas) |
| 2014 | Sistemas de Informação | 35 |
| 2014 | Análise e Desenvolvimento de Sistemas | 35 |
| 2017 | Ciência da Computação | 35 |
| 2017 | Engenharia de Computação | 35 |
| 2017 | Sistemas de Informação | 35 (1 anulada) |
| 2017 | Análise e Desenvolvimento de Sistemas | 35 (1 anulada) |
| 2019 | Engenharia de Computação | 35 (1 anulada) |
| 2021 | Ciência da Computação | 35 (2 anuladas) |
| 2021 | Sistemas de Informação | 35 (1 anulada) |
| 2021 | Análise e Desenvolvimento de Sistemas | 35 |
| 2023 | Engenharia de Computação | 38 |

Cada prova tem 8 ou 9 questões de Formação Geral; as outras são do componente específico do curso. O Enade avalia cada curso a cada três ou quatro anos, por isso 2015, 2016, 2018, 2020, 2022 e de 2024 a 2026 não têm prova desses cursos.

<a id="pt-estrutura"></a>

### Estrutura do projeto

```
crawler/   busca, download, extração (pdf.js + canvas), gabaritos, classificação e padrões
public/    o site (HTML/CSS/JS puro, sem framework) e os dados gerados
tests/     teste rápido no Chrome (npm test)
```

*As questões e os gabaritos pertencem ao Inep e estão reproduzidos aqui para estudo pessoal.*

[Voltar ao topo](#enade-gazeta)
