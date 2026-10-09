// extracao_posicional.js: "ferramenta de captura" -- em vez de só digitar
// o valor no painel de aprendizado, a pessoa pode desenhar um retângulo
// sobre a pré-visualização do documento marcando onde o campo fica; isso
// complementa a âncora de texto de aprendizado_extracao.js (posição tem
// prioridade quando resolve; âncora de texto continua como plano B).
// Testa a lógica pura de correlação (palavra posicionada x retângulo) e a
// cadeia de prioridade posição -> âncora -> regex genérica dentro de
// leitor_documentos.js/extrairCampos -- tudo sem precisar de OCR/pdf.js de
// verdade. As palavras posicionadas reais só passam a existir a partir das
// Fases 2/3 desta funcionalidade (ocr_imagem.js/pdf_render.js); aqui elas
// são simuladas à mão, no mesmo formato { texto, x0, y0, x1, y1 } (frações
// 0..1 da página) que esses módulos vão produzir.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checarIgual, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { erros } = await bootApp(PERFIS.departamento);
const { encontrarTextoNaRegiao, extrairValorDaRegiao, derivarPosicao, aplicarHintsDePosicao } = await import('./app/src/js/extracao_posicional.js');
const { extrairCampos } = await import('./app/src/js/leitor_documentos.js');

// Simula uma página com "Valor a pagar:" numa linha e "R$ 339,95" na linha
// de baixo, mais um CNPJ do lado.
const palavrasPagina1 = [
  { texto: 'Valor', x0: 0.10, y0: 0.20, x1: 0.16, y1: 0.23 },
  { texto: 'a', x0: 0.17, y0: 0.20, x1: 0.19, y1: 0.23 },
  { texto: 'pagar:', x0: 0.20, y0: 0.20, x1: 0.28, y1: 0.23 },
  { texto: 'R$', x0: 0.10, y0: 0.25, x1: 0.14, y1: 0.28 },
  { texto: '339,95', x0: 0.15, y0: 0.25, x1: 0.24, y1: 0.28 },
  { texto: '23.747.576/0001-12', x0: 0.50, y0: 0.25, x1: 0.75, y1: 0.28 },
];

// 1) encontrarTextoNaRegiao: retângulo cobrindo só "R$ 339,95".
const regiaoValor = { x: 0.08, y: 0.24, largura: 0.20, altura: 0.05 };
checarIgual(encontrarTextoNaRegiao(palavrasPagina1, regiaoValor), 'R$ 339,95', 'retângulo sobre o valor junta as palavras da mesma linha em ordem de leitura');

// 2) encontrarTextoNaRegiao: retângulo cobrindo as DUAS linhas (rótulo +
// valor) -- ainda sai na ordem certa (linha de cima primeiro).
const regiaoDuasLinhas = { x: 0.08, y: 0.19, largura: 0.25, altura: 0.10 };
checarIgual(encontrarTextoNaRegiao(palavrasPagina1, regiaoDuasLinhas), 'Valor a pagar: R$ 339,95', 'retângulo cobrindo duas linhas mantém a ordem de leitura (cima -> baixo, esquerda -> direita)');

// 3) encontrarTextoNaRegiao: sem nenhuma palavra dentro do retângulo.
checarIgual(encontrarTextoNaRegiao(palavrasPagina1, { x: 0.9, y: 0.9, largura: 0.05, altura: 0.05 }), '', 'retângulo sem nenhuma palavra dentro devolve string vazia');
checarIgual(encontrarTextoNaRegiao([], regiaoValor), '', 'lista de palavras vazia devolve string vazia, não quebra');
checarIgual(encontrarTextoNaRegiao(null, regiaoValor), '', 'lista de palavras nula não quebra');
checarIgual(encontrarTextoNaRegiao(palavrasPagina1, null), '', 'retângulo nulo não quebra');

// 4) extrairValorDaRegiao: aplica a regex do campo sobre o texto achado.
checarIgual(extrairValorDaRegiao('valor', 'R$ 339,95'), 339.95, 'extrairValorDaRegiao(valor) converte pro número (separador BR)');
checarIgual(extrairValorDaRegiao('cnpj', '23.747.576/0001-12'), '23.747.576/0001-12', 'extrairValorDaRegiao(cnpj) devolve o CNPJ como está');
checarIgual(extrairValorDaRegiao('numeroNota', 'Nº 000.984'), '000984', 'extrairValorDaRegiao(numeroNota) remove pontuação');
checarIgual(extrairValorDaRegiao('valor', 'nada de útil aqui'), null, 'texto sem o formato esperado não extrai nada (devolve null)');
checarIgual(extrairValorDaRegiao('valor', ''), null, 'texto vazio não extrai nada');
checarIgual(extrairValorDaRegiao('tipo', 'boleto'), 'boleto', 'campo "tipo" devolve o texto selecionado direto (sem regex)');

// 5) derivarPosicao: empacota retângulo + página pro formato de gravação
// (db.salvarExtracaoHint).
checarIgual(JSON.stringify(derivarPosicao(2, regiaoValor)), JSON.stringify({ pagina: 2, tipo_pagina: null, pos_x: 0.08, pos_y: 0.24, pos_largura: 0.20, pos_altura: 0.05 }), 'derivarPosicao empacota página + retângulo no formato que db.salvarExtracaoHint espera');
checarIgual(derivarPosicao(3, regiaoValor, 'boleto').tipo_pagina, 'boleto', 'derivarPosicao leva junto o tipo da página quando informado (aba Treinamento)');
checarIgual(derivarPosicao(undefined, regiaoValor).pagina, 1, 'sem página informada, assume página 1 (documento de página única)');

// 6) aplicarHintsDePosicao: hint de posição aprendido resolve o campo
// cruzando a região com as palavras de um documento novo do mesmo
// fornecedor.
const hintsPosicao = [{ campo: 'valor', pagina: 1, pos_x: 0.08, pos_y: 0.24, pos_largura: 0.20, pos_altura: 0.05 }];
const resolvidoPorPosicao = aplicarHintsDePosicao(hintsPosicao, { 1: palavrasPagina1 });
checarIgual(resolvidoPorPosicao.valor, 339.95, 'hint de posição aprendido resolve o campo cruzando a região com as palavras do documento atual');

// 7) aplicarHintsDePosicao: sem palavras posicionadas disponíveis, não
// resolve nada -- mas não quebra (quem chama cai pro plano B).
checarIgual(Object.keys(aplicarHintsDePosicao(hintsPosicao, {})).length, 0, 'sem palavras posicionadas pra página do hint, não resolve nada (mas não quebra)');
checarIgual(Object.keys(aplicarHintsDePosicao(hintsPosicao, null)).length, 0, 'sem nenhuma palavra posicionada no documento atual (ex: Fase 1, antes do OCR/pdf.js gerarem posição), não resolve nada');
checarIgual(Object.keys(aplicarHintsDePosicao([], { 1: palavrasPagina1 })).length, 0, 'lista de hints vazia devolve objeto vazio');

// 8) aplicarHintsDePosicao: hint só com âncora de texto (sem posição
// gravada) é ignorado por este módulo -- quem aplica âncora é
// aprendizado_extracao.js.
const hintsSoAncora = [{ campo: 'valor', ancora: 'valor a pagar:' }];
checarIgual(Object.keys(aplicarHintsDePosicao(hintsSoAncora, { 1: palavrasPagina1 })).length, 0, 'hint só com âncora de texto (sem posição) é ignorado por este módulo');

// 9) Integração com leitor_documentos.js/extrairCampos: quando os dois
// tipos de hint existem, posição tem prioridade; âncora de texto resolve
// os campos que não têm hint de posição; regra de sempre (regex genérica)
// continua como último recurso.
const textoDocumento = 'Numero do documento fiscal: 000984\nValor a pagar: R$ 339,95';
const hintsMistos = [
  { campo: 'valor', pagina: 1, pos_x: 0.08, pos_y: 0.24, pos_largura: 0.20, pos_altura: 0.05 },
  { campo: 'numeroNota', ancora: 'numero do documento fiscal:' },
];
const camposComPosicao = extrairCampos(textoDocumento, hintsMistos, { 1: palavrasPagina1 });
checarIgual(camposComPosicao.valor, 339.95, 'extrairCampos resolve "valor" pelo hint de posição quando palavrasPorPagina foi fornecido');
checarIgual(camposComPosicao.numeroNota, '000984', 'extrairCampos resolve "numeroNota" pela âncora de texto (não tem hint de posição pra esse campo)');

// 10) Sem palavrasPorPagina (documento ainda sem suporte a posição, ou a
// própria Fase 1 antes do OCR/pdf.js existirem), o campo continua
// resolvendo -- só que pela regra de sempre, sem quebrar nem regredir o
// comportamento textual já existente.
const camposSemPalavras = extrairCampos(textoDocumento, hintsMistos, undefined);
checarIgual(camposSemPalavras.valor, 339.95, 'sem palavrasPorPagina, "valor" ainda resolve -- cai pra regex genérica (R$ no texto), não quebra por falta de posição');
checarIgual(camposSemPalavras.numeroNota, '000984', 'numeroNota continua resolvendo pela âncora de texto de qualquer forma');

// 11) PDF que junta vários documentos em ordem variável: a dica foi
// indicada no BOLETO (página 1 daquela nota), mas nesta nota o boleto é a
// página 2. A página gravada (1) tem outra coisa na mesma região; a dica
// tem que achar o valor na página do tipo certo.
const { paginasParaTentar } = await import('./app/src/js/extracao_posicional.js');
const { tiposDasPaginas, valorValidoParaCampo } = await import('./app/src/js/leitor_documentos.js');
const p = (texto, x0, y0) => ({ texto, x0, y0, x1: x0 + 0.15, y1: y0 + 0.03 });
const nf = [p('DANFE', 0.1, 0.05), p('NOTA', 0.3, 0.05), p('FISCAL', 0.45, 0.05), p('Pedido', 0.08, 0.25), p('12/12', 0.2, 0.25)];
const boleto = [p('Ficha', 0.1, 0.05), p('de', 0.25, 0.05), p('Compensação', 0.3, 0.05), p('Linha', 0.5, 0.05), p('digitável', 0.6, 0.05), p('Cedente', 0.1, 0.1), p('Vencimento', 0.08, 0.20), p('15/03/2026', 0.1, 0.25)];
const porPagina = { 1: nf, 2: boleto };
const tipos = tiposDasPaginas(porPagina);
checarIgual(tipos, { 1: 'nota_fiscal', 2: 'boleto' }, 'cada página é classificada pelo próprio texto');
const hintVenc = { campo: 'vencimento', pagina: 1, tipo_pagina: 'boleto', pos_x: 0.05, pos_y: 0.22, pos_largura: 0.3, pos_altura: 0.08 };
checarIgual(paginasParaTentar(hintVenc, [1, 2], tipos), [2, 1], 'tenta primeiro a página do mesmo tipo, depois a gravada');
checarIgual(aplicarHintsDePosicao([hintVenc], porPagina, { tiposPorPagina: tipos, valida: valorValidoParaCampo }).vencimento, '15/03/2026', 'acha o vencimento no boleto mesmo ele estando em outra página nesta nota');
const semTipo = { ...hintVenc, tipo_pagina: null };
checarIgual(aplicarHintsDePosicao([semTipo], porPagina, { valida: valorValidoParaCampo }).vencimento, '15/03/2026', 'sem tipo gravado: a página 1 não tem data válida na região, tenta as outras e acha');
checarIgual(valorValidoParaCampo('cnpj', '11.222.333/0001-82'), false, 'CNPJ achado pela dica com DV errado não vale');
checarIgual(valorValidoParaCampo('dataEmissao', '31/02/2026'), false, 'data impossível achada pela dica não vale');

checarSemErrosNaoTratados(erros, 'extracao_posicional');
relatorioFinal('extracao_posicional');
