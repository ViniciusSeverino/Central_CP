// documentos_obrigatorios.js: quais documentos uma nota deveria ter
// anexado (regra inicial derivada da forma de pagamento/tipo de
// contratação/retenção de imposto, alinhada ao documento WE9 -- só
// aponta o que falta, nunca bloqueia) e a comparação entre o que foi
// digitado no formulário e o que o leitor de documentos encontrou nos
// anexos (divergência de NF/valor).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checarIgual, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { erros } = await bootApp(PERFIS.departamento);
const { documentosObrigatoriosPara, auditarAnexos } = await import('./app/src/js/documentos_obrigatorios.js');

// 1) Regras de documentos obrigatórios por combinação de campos.
const soBoleto = documentosObrigatoriosPara({ forma_pagamento: 'Boleto bancário', tipo_contratacao: null, tem_retencao_imposto: false });
checarIgual(soBoleto.map(d => d.tipo).join(','), 'nota_fiscal,boleto', 'boleto simples exige nota fiscal + boleto, nada mais');

const tedMensalComImposto = documentosObrigatoriosPara({ forma_pagamento: 'TED', tipo_contratacao: 'mensal', tem_retencao_imposto: true });
checarIgual(tedMensalComImposto.map(d => d.tipo).join(','), 'nota_fiscal,comprovante_pagamento,contrato,guia_imposto', 'TED + contrato mensal + retenção de imposto acumula os 4 documentos');

const sobDemandaPix = documentosObrigatoriosPara({ forma_pagamento: 'Pix', tipo_contratacao: 'sob_demanda', tem_retencao_imposto: false });
checarIgual(sobDemandaPix.map(d => d.tipo).join(','), 'nota_fiscal,comprovante_pagamento', 'Pix sob demanda exige nota fiscal + comprovante, mas não contrato (não é mensal)');

// 2) Auditoria: documento faltando.
const auditoriaFaltando = auditarAnexos(
  { forma_pagamento: 'TED', tipo_contratacao: null, tem_retencao_imposto: false, numero_nota: 'NF-1', valor_bruto: 100 },
  [{ nomeArquivo: 'nf.pdf', tipoDetectado: 'nota_fiscal', campos: { numeroNota: '1', valor: 100 } }],
);
checarIgual(auditoriaFaltando.faltando.map(f => f.tipo).join(','), 'comprovante_pagamento', 'TED sem comprovante anexado aponta o comprovante como faltando');
checarIgual(auditoriaFaltando.divergencias.length, 0, 'NF e valor batem -- nenhuma divergência apontada');

// 3) Auditoria: nada faltando (todos os documentos exigidos presentes).
const auditoriaCompleta = auditarAnexos(
  { forma_pagamento: 'TED', tipo_contratacao: null, tem_retencao_imposto: false, numero_nota: 'NF-1', valor_bruto: 100 },
  [
    { nomeArquivo: 'nf.pdf', tipoDetectado: 'nota_fiscal', campos: { numeroNota: '1', valor: 100 } },
    { nomeArquivo: 'comprovante.pdf', tipoDetectado: 'comprovante_pagamento', campos: {} },
  ],
);
checarIgual(auditoriaCompleta.faltando.length, 0, 'com os dois documentos anexados, nada fica faltando');

// 4) Divergência: número da NF ou valor não bate com o que foi digitado.
const auditoriaDivergente = auditarAnexos(
  { forma_pagamento: 'Boleto bancário', tipo_contratacao: null, tem_retencao_imposto: false, numero_nota: '9999', valor_bruto: 500 },
  [{ nomeArquivo: 'nf-errada.pdf', tipoDetectado: 'nota_fiscal', campos: { numeroNota: '1234', valor: 999 } }],
);
checarIgual(auditoriaDivergente.divergencias.length, 2, 'NF e valor diferentes do digitado geram 2 avisos de divergência');
checarContem(auditoriaDivergente.divergencias, 'NF', 'menciona o número da NF na divergência');
checarContem(auditoriaDivergente.divergencias, 'valor', 'menciona o valor na divergência');

function checarContem(lista, trecho, descricao) {
  const bateu = lista.some(l => l.toLowerCase().includes(trecho.toLowerCase()));
  checarIgual(bateu, true, descricao);
}

// 5) Comparação de número da NF ignora zeros à esquerda e pontuação
// (documento costuma vir "000123", formulário costuma ter só "123").
const auditoriaZeros = auditarAnexos(
  { forma_pagamento: 'Boleto bancário', tipo_contratacao: null, tem_retencao_imposto: false, numero_nota: '123', valor_bruto: 500 },
  [{ nomeArquivo: 'nf.pdf', tipoDetectado: 'nota_fiscal', campos: { numeroNota: '000.123', valor: 500 } }],
);
checarIgual(auditoriaZeros.divergencias.length, 0, 'NF "000.123" no documento bate com "123" digitado (zeros à esquerda/pontuação ignorados)');

// 6) Sem nenhum anexo: todos os documentos obrigatórios ficam faltando.
const auditoriaSemAnexo = auditarAnexos(
  { forma_pagamento: 'Boleto bancário', tipo_contratacao: 'mensal', tem_retencao_imposto: false, numero_nota: 'NF-1', valor_bruto: 100 },
  [],
);
checarIgual(auditoriaSemAnexo.faltando.map(f => f.tipo).join(','), 'nota_fiscal,boleto,contrato', 'sem nenhum anexo, todos os documentos exigidos aparecem como faltando');

checarSemErrosNaoTratados(erros, 'documentos_obrigatorios_auditoria');
relatorioFinal('documentos_obrigatorios_auditoria');
