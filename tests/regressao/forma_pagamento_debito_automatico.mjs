// Forma de pagamento "Débito automático" (migration 0052): aparece no
// formulário e no lote, não pede conta bancária nem comprovante (só a NF)
// e vira DDA no nome do arquivo.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros } = await bootApp(PERFIS.departamento);
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

document.getElementById('btn-nova-nota').click();
await esperar(80);
const forma = document.getElementById('nf-forma-pagamento');
checar(Array.from(forma.options).some(o => o.value === 'Débito automático'), 'formulário tem a opção Débito automático');
document.getElementById('nf-fornecedor').value = 'forn-1';
forma.value = 'Débito automático';
forma.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
await esperar(30);
const conta = document.getElementById('conta-bancaria-area');
checar(conta.textContent.includes('Não se aplica') && !conta.querySelector('#nf-conta-bancaria'), 'não pede conta bancária');

const { documentosObrigatoriosPara } = await import('./app/src/js/documentos_obrigatorios.js');
checarIgual(documentosObrigatoriosPara({ forma_pagamento: 'Débito automático' }).map(d => d.tipo), ['nota_fiscal'], 'só a nota fiscal é obrigatória');
const { FORMAS_PAGAMENTO_VALIDAS } = await import('./app/src/js/import_historico.js');
checar(FORMAS_PAGAMENTO_VALIDAS.includes('Débito automático'), 'importação do histórico e modelo Excel aceitam Débito automático');
const { siglaFormaPagamento } = await import('./app/src/js/anexos_pdf.js');
checarIgual(siglaFormaPagamento('Débito automático'), 'DDA', 'sigla no nome do arquivo é DDA');

document.getElementById('btn-lote-nota').click();
await esperar(80);
const loteForma = document.querySelector('[id^="lote-forma-pagamento-"]');
checar(!!loteForma && Array.from(loteForma.options).some(o => o.value === 'Débito automático'), 'lançamento em lote também tem a opção');

checarSemErrosNaoTratados(erros, 'forma_pagamento_debito_automatico');
relatorioFinal('forma_pagamento_debito_automatico');
