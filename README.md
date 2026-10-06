# Enade Gazeta

<p align="center">
  <a href="#en"><b>English</b></a> &nbsp;|&nbsp; <a href="#pt-br"><b>Português (Brasil)</b></a>
</p>

---

<a id="en"></a>

<h2 align="center">English</h2>

[Getting started](#en-getting-started) · [What the crawler does](#en-crawler) · [Current collection](#en-collection) · [Project layout](#en-layout)

A study site for the Computing exam of Enade, Brazil's national assessment of undergraduate courses. It uses INEP's official tests from 2022 onwards. A crawler finds the test booklets and answer keys on INEP's site, crops each question from the PDF and tags it with a topic and a question format. The interface is in Brazilian Portuguese and is styled like a newspaper. You can solve questions with filters, take timed mock exams and look at the patterns found across the tests.

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

1. Reads the `provas-e-gabaritos/<year>` pages in INEP's Enade sections for bachelor's and teaching degrees, from 2022 through the current year, and collects the PDF links.
2. Keeps the computing courses. Some years have no bachelor's computing test; for those it takes only the general education section ("Formação Geral") from another course, because that section is the same for every bachelor's course in a given year.
3. Downloads booklet 1 and the final answer key into `data/raw/`, skipping files it already has.
4. Finds the "QUESTÃO NN" headers in the PDF's positioned text, follows two-column pages and shared base texts ("Texto para as questões 31 a 33"), and crops each question from the rendered page. The app shows these crops, so every question looks the way it does in the booklet. The extracted text is used for search and classification only.
5. Reads the answer key, which INEP publishes as a list, a grid or an image. The 2025 and 2026 keys are images, so their transcription is in `crawler/manual-answer-keys.json`.
6. Tags each question with a topic and a format (assertion-reason, "evaluate the statements", code, classroom scenario and others) by keyword matching. Manual corrections go in `crawler/overrides.json`.
7. Computes statistics over the real alternatives: how often each topic appears per test, how often absolute words such as "todos" and "sempre" appear in correct and wrong alternatives, which words show up more in correct alternatives, the answer distribution for assertion-reason and statement questions, and the spread of answer letters.

To limit the years, run `npm run crawl -- --years=2023-2025`. To reprocess text and classification without re-rendering the crops, run `npm run crawl -- --no-images`.

When INEP publishes a new computing test, such as Ciência da Computação for bachelor's degrees, run `npm run crawl` again. If the new answer key is only an image, the crawler prints a warning; add the transcription to `crawler/manual-answer-keys.json`. `node crawler/render-page.js <pdf> <dir>` renders the page as a PNG so you can read it.

<a id="en-collection"></a>

### Current collection

| Year | Test | Objective questions |
| --- | --- | --- |
| 2022 | General education (bachelor's degrees) | 8 |
| 2023 | Engenharia da Computação | 38 |
| 2024 | Licenciatura em Computação (teaching degree) | 63 (2 annulled) |
| 2025 | Licenciatura em Computação (teaching degree) | 80 (2 annulled) |
| 2025 | General education (bachelor's degrees) | 15 |
| 2026 | Licenciatura em Computação (teaching degree) | 80 |

Ciência da Computação (bachelor's) was not part of the Enade cycle between 2022 and 2025.

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

Um site de estudo para a prova de Computação do Enade, feito com as provas oficiais do Inep de 2022 em diante. Um crawler encontra os cadernos de prova e os gabaritos no site do Inep, recorta cada questão do PDF e classifica cada uma por assunto e formato. A interface é em português e tem cara de jornal. Dá para resolver questões com filtros, fazer simulados com tempo e ver os padrões encontrados nas provas.

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

1. Lê as páginas `provas-e-gabaritos/<ano>` das seções do Enade no site do Inep, de bacharelados e de licenciaturas, de 2022 até o ano atual, e junta os links dos PDFs.
2. Fica com os cursos de Computação. Em alguns anos não houve prova de Computação no bacharelado; nesses casos ele pega só a parte de Formação Geral de outro curso, porque essa parte é a mesma para todos os bacharelados do ano.
3. Baixa o caderno 1 e o gabarito definitivo para `data/raw/`, pulando os arquivos que já existem.
4. Procura os cabeçalhos "QUESTÃO NN" no texto posicionado do PDF, acompanha páginas em duas colunas e textos-base compartilhados ("Texto para as questões 31 a 33") e recorta cada questão da página renderizada. O site mostra esses recortes, então cada questão aparece como no caderno. O texto extraído serve só para busca e classificação.
5. Lê o gabarito, que o Inep publica como lista, como grade ou como imagem. Os gabaritos de 2025 e 2026 são imagens, por isso a transcrição deles fica em `crawler/manual-answer-keys.json`.
6. Marca cada questão com um assunto e um formato (asserção-razão, "avalie as afirmativas", código, situação de sala de aula e outros) por palavras-chave. As correções manuais ficam em `crawler/overrides.json`.
7. Calcula estatísticas sobre as alternativas reais: quantas vezes cada assunto aparece por prova, com que frequência palavras absolutas como "todos" e "sempre" aparecem nas alternativas certas e nas erradas, quais palavras aparecem mais nas alternativas certas, a distribuição das respostas em asserção-razão e em afirmativas, e a distribuição das letras do gabarito.

Para limitar os anos, rode `npm run crawl -- --years=2023-2025`. Para reprocessar texto e classificação sem gerar os recortes de novo, rode `npm run crawl -- --no-images`.

Quando o Inep publicar uma prova nova de Computação, como a de Ciência da Computação no bacharelado, rode `npm run crawl` de novo. Se o gabarito novo vier só como imagem, o crawler avisa; adicione a transcrição em `crawler/manual-answer-keys.json`. O comando `node crawler/render-page.js <pdf> <pasta>` gera um PNG da página para você ler.

<a id="pt-provas"></a>

### Provas disponíveis

| Ano | Prova | Questões objetivas |
| --- | --- | --- |
| 2022 | Formação Geral (bacharelados) | 8 |
| 2023 | Engenharia da Computação | 38 |
| 2024 | Licenciatura em Computação | 63 (2 anuladas) |
| 2025 | Licenciatura em Computação | 80 (2 anuladas) |
| 2025 | Formação Geral (bacharelados) | 15 |
| 2026 | Licenciatura em Computação | 80 |

Ciência da Computação (bacharelado) não entrou no ciclo do Enade entre 2022 e 2025.

<a id="pt-estrutura"></a>

### Estrutura do projeto

```
crawler/   busca, download, extração (pdf.js + canvas), gabaritos, classificação e padrões
public/    o site (HTML/CSS/JS puro, sem framework) e os dados gerados
tests/     teste rápido no Chrome (npm test)
```

*As questões e os gabaritos pertencem ao Inep e estão reproduzidos aqui para estudo pessoal.*

[Voltar ao topo](#enade-gazeta)
