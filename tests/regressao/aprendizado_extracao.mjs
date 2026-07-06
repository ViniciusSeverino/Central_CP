// aprendizado_extracao.js: "ensinar o leitor" -- quando o leitor de
// documentos não acha um campo, o painel de auditoria pergunta pra pessoa
// e guarda a resposta como uma dica (âncora de texto) associada ao
// fornecedor. Testa a lógica pura: aplicar uma âncora aprendida pra
// extrair um valor, derivar a âncora a partir de uma resposta, gerar
// candidatos e decidir quais perguntas fazer -- tudo sem precisar de
// PDF/OCR de verdade (isso já é coberto em leitor_documentos_pdf_e_ocr.mjs).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checarIgual, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { erros } = await bootApp(PERFIS.departamento);
const { aplicarHints, derivarAncora, candidatosParaCampo, perguntasPendentes } = await import('./app/src/js/aprendizado_extracao.js');

// 1) aplicarHints: acha o valor certo numa janela logo após a âncora.
const textoNota = 'DANFE NOTA FISCAL\nNumero do documento fiscal: 000984\nValor a pagar: R$ 339,95\nCNPJ Emitente: 23.747.576/0001-12';
const hints1 = [
  { campo: 'numeroNota', ancora: 'numero do documento fiscal:' },
  { campo: 'valor', ancora: 'valor a pagar:' },
];
const aplicado1 = aplicarHints(textoNota, hints1);
checarIgual(aplicado1.numeroNota, '000984', 'aplicarHints acha o número da nota na janela logo após a âncora aprendida');
checarIgual(aplicado1.valor, 339.95, 'aplicarHints acha o valor (convertido de BR pra número) logo após a âncora');

// 2) aplicarHints: âncora que não existe no texto não quebra, só não
// resolve aquele campo (quem chama mantém o que já tinha).
const semAncora = aplicarHints(textoNota, [{ campo: 'numeroNota', ancora: 'texto que não existe aqui' }]);
checarIgual(semAncora.numeroNota, undefined, 'âncora não encontrada no texto não resolve o campo (não lança erro)');

// 3) aplicarHints: hint de tipo usa valor_exemplo diretamente (sem âncora).
const hintTipo = aplicarHints(textoNota, [{ campo: 'tipo', valor_exemplo: 'nota_fiscal' }]);
checarIgual(hintTipo.tipo, 'nota_fiscal', 'hint de campo "tipo" devolve o valor_exemplo direto, sem precisar de âncora no texto');

// 4) aplicarHints: sem hints ou sem texto devolve objeto vazio, não quebra.
checarIgual(Object.keys(aplicarHints(textoNota, [])).length, 0, 'lista de hints vazia devolve objeto vazio');
checarIgual(Object.keys(aplicarHints('', hints1)).length, 0, 'texto vazio devolve objeto vazio');
checarIgual(Object.keys(aplicarHints(null, hints1)).length, 0, 'texto nulo não quebra, devolve objeto vazio');

// 5) derivarAncora: pega o trecho de texto logo antes do valor escolhido.
const ancoraDerivada = derivarAncora('Numero do documento fiscal: 000984', '000984');
checarIgual(ancoraDerivada, 'numero do documento fiscal:', 'derivarAncora pega o texto logo antes do valor escolhido pela pessoa');

// 6) derivarAncora: valor que não aparece no texto não tem âncora (não
// tem como aprender onde ele estaria).
checarIgual(derivarAncora(textoNota, '999999'), '', 'valor que não aparece no texto não gera âncora (string vazia)');
checarIgual(derivarAncora('', '000984'), '', 'texto vazio não gera âncora');

// 7) Uma âncora derivada de uma nota deve funcionar aplicada em OUTRA nota
// do mesmo fornecedor (esse é o ponto todo: aprender uma vez, reaplicar
// depois) -- simula o ciclo completo.
const textoOutraNotaMesmoFornecedor = 'DANFE NOTA FISCAL\nNumero do documento fiscal: 001250\nValor a pagar: R$ 88,00';
const aplicadoCiclo = aplicarHints(textoOutraNotaMesmoFornecedor, [{ campo: 'numeroNota', ancora: ancoraDerivada }]);
checarIgual(aplicadoCiclo.numeroNota, '001250', 'âncora aprendida numa nota resolve o campo certo em outra nota do mesmo fornecedor');

// 8) candidatosParaCampo: acha candidatos soltos no texto (sem âncora).
const candidatosValor = candidatosParaCampo('valor', textoNota);
checarIgual(candidatosValor.includes('339,95'), true, 'candidatosParaCampo(valor) acha o valor no formato R$ do texto');
const candidatosNumero = candidatosParaCampo('numeroNota', 'Nota 000984, protocolo 135262129724331');
checarIgual(candidatosNumero.length > 0 && candidatosNumero.includes('000984'), true, 'candidatosParaCampo(numeroNota) acha sequências de dígitos como candidatas');
checarIgual(candidatosParaCampo('valor', '').length, 0, 'candidatosParaCampo com texto vazio devolve lista vazia');

// 9) perguntasPendentes: só pergunta o que realmente falta.
const perguntasTudoFaltando = perguntasPendentes({ tipoDetectado: 'nao_identificado', campos: {}, texto: textoNota });
checarIgual(perguntasTudoFaltando.map(p => p.campo).sort().join(','), 'numeroNota,tipo,valor', 'quando tipo não identificado e campos vazios, pergunta os 3 (tipo, número, valor)');

const perguntasSoValor = perguntasPendentes({ tipoDetectado: 'nota_fiscal', campos: { numeroNota: '984' }, texto: textoNota });
checarIgual(perguntasSoValor.map(p => p.campo).join(','), 'valor', 'quando só falta o valor, pergunta só sobre o valor (tipo e número já resolvidos)');

const semPerguntas = perguntasPendentes({ tipoDetectado: 'nota_fiscal', campos: { numeroNota: '984', valor: 339.95 }, texto: textoNota });
checarIgual(semPerguntas.length, 0, 'quando tudo já foi resolvido, não sobra nenhuma pergunta');

checarIgual(perguntasPendentes(null).length, 0, 'análise nula não quebra, devolve lista vazia');
checarIgual(perguntasPendentes({ tipoDetectado: 'nao_identificado', campos: {}, texto: '' }).length, 0, 'análise sem texto (ex: OCR falhou) não gera perguntas -- não tem o que perguntar sobre um texto vazio');

checarSemErrosNaoTratados(erros, 'aprendizado_extracao');
relatorioFinal('aprendizado_extracao');
