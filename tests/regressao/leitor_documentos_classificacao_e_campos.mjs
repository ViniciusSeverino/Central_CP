// leitor_documentos.js: classificação do tipo de documento (nota fiscal,
// boleto, comprovante de pagamento, contrato, guia de imposto) e
// extração de campos (Nº da NF, valor, CNPJ/CPF, data) a partir do texto
// já extraído (de um PDF digital ou de OCR) -- pura heurística de
// palavra-chave/regex, testável sem precisar de PDF/OCR de verdade (essa
// parte fica no e2e, ver leitor_documentos_pdf_e_ocr.mjs).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checarIgual, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { erros } = await bootApp(PERFIS.departamento);
const { classificarTipoDocumento, extrairCampos } = await import('./app/src/js/leitor_documentos.js');

// 1) Classificação por palavra-chave.
checarIgual(classificarTipoDocumento('DANFE - Documento Auxiliar da Nota Fiscal Eletrônica NF-e nº 12345'), 'nota_fiscal', 'DANFE/NF-e classifica como nota_fiscal');
checarIgual(classificarTipoDocumento('BOLETO BANCÁRIO - Ficha de Compensação - Linha Digitável - Cedente: Fornecedor X - Sacado: Boulevard'), 'boleto', 'texto de boleto classifica como boleto');
checarIgual(classificarTipoDocumento('Comprovante de Pagamento - TED Realizada com sucesso em 01/07/2026'), 'comprovante_pagamento', 'comprovante de TED classifica como comprovante_pagamento');
checarIgual(classificarTipoDocumento('CONTRATO DE PRESTAÇÃO DE SERVIÇOS - CONTRATANTE e CONTRATADA acordam as CLÁUSULAS a seguir, vigência do contrato de 12 meses'), 'contrato', 'texto de contrato classifica como contrato');
checarIgual(classificarTipoDocumento('DARF - Documento de Arrecadação de Receitas Federais'), 'guia_imposto', 'DARF classifica como guia_imposto');
checarIgual(classificarTipoDocumento('texto qualquer sem nenhuma palavra-chave reconhecida'), 'nao_identificado', 'texto sem palavra-chave nenhuma vira "não identificado" (não força um chute)');
checarIgual(classificarTipoDocumento(''), 'nao_identificado', 'texto vazio vira "não identificado"');
checarIgual(classificarTipoDocumento(null), 'nao_identificado', 'texto nulo (ex: OCR falhou) não quebra, vira "não identificado"');

// 2) Extração de campos.
const textoNota = `
  DANFE - NOTA FISCAL ELETRÔNICA
  Nº 000.123.456
  CNPJ: 12.345.678/0001-99
  Data de emissão: 01/07/2026
  VALOR TOTAL DA NOTA: R$ 1.234,56
`;
const campos = extrairCampos(textoNota);
checarIgual(campos.numeroNota, '000123456', 'extrai o número da NF (sem pontos)');
checarIgual(campos.valor, 1234.56, 'extrai o valor em formato numérico (não string), convertendo separador brasileiro');
checarIgual(campos.cnpj, '12.345.678/0001-99', 'extrai o CNPJ no formato com pontuação');
checarIgual(campos.data, '01/07/2026', 'extrai a data no formato DD/MM/AAAA');

const campoCpf = extrairCampos('Prestador de serviço CPF: 123.456.789-01, valor R$ 90,00');
checarIgual(campoCpf.cpf, '123.456.789-01', 'quando não tem CNPJ, extrai CPF');
checarIgual(campoCpf.cnpj, undefined, 'não confunde CPF com CNPJ (não preenche os dois)');
checarIgual(campoCpf.valor, 90, 'valor sem separador de milhar também extrai certo (R$ 90,00 -> 90)');

const campoValorGrande = extrairCampos('Total: R$ 12.345,00');
checarIgual(campoValorGrande.valor, 12345, 'valor com separador de milhar extrai certo (R$ 12.345,00 -> 12345)');

const semCampos = extrairCampos('texto qualquer sem nenhum dado reconhecível');
checarIgual(Object.keys(semCampos).length, 0, 'texto sem nenhum campo reconhecível devolve objeto vazio, não quebra');
checarIgual(Object.keys(extrairCampos('')).length, 0, 'texto vazio devolve objeto vazio');
checarIgual(Object.keys(extrairCampos(null)).length, 0, 'texto nulo devolve objeto vazio, sem lançar erro');

checarSemErrosNaoTratados(erros, 'leitor_documentos_classificacao_e_campos');
relatorioFinal('leitor_documentos_classificacao_e_campos');
