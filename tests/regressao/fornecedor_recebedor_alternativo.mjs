// Fornecedor que emite a NF num CNPJ e recebe em outro (matriz/filial,
// migration 0054): vínculo no cadastro, seletor "Quem recebe o pagamento"
// no lançamento só pra esse fornecedor, contas bancárias de quem recebe,
// e o recebedor no detalhe, no Excel e no chamado.
// Fixture: forn-5 recebe via forn-0 (que tem a conta-0); forn-5 não tem conta.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.administrador);
const { app } = await import('./app/src/js/state.js');
const { render } = await import('./app/src/js/app.js');
const esperar = (ms) => new Promise(r => setTimeout(r, ms));
const disparar = (el, tipo = 'change') => el.dispatchEvent(new dom.window.Event(tipo, { bubbles: true }));

console.log('### Cadastro ###');
app.state.view = 'cadastros'; app.state.configTab = 'cadastros'; app.state.cadastroTab = 'fornecedores';
app.state.modal = 'editar_fornecedor'; app.state.modalData = 'forn-7';
render();
await esperar(50);
const campo = document.getElementById('cadnew-recebedor');
checar(!!campo && document.querySelectorAll('#cadnew-recebedor-lista option').length > 0, 'cadastro do fornecedor tem o campo "Pagamento em outro CNPJ" com sugestões');
checar(!Array.from(document.querySelectorAll('#cadnew-recebedor-lista option')).some(o => o.value.startsWith('Fornecedor Teste 7')), 'o próprio fornecedor não aparece como recebedor dele mesmo');
campo.value = 'Fornecedor Teste 1';
document.getElementById('cadnew-nome').value = 'Fornecedor Teste 7';
document.getElementById('confirmar-fornecedor').click();
await esperar(80);
checarIgual(supabaseClientMod.__fixtures().fornecedores.find(f => f.id === 'forn-7').recebedor_pagamento_id, 'forn-1', 'salva o vínculo com o recebedor escolhido');

console.log('### Lançamento ###');
app.state.modal = null; app.state.view = 'dashboard';
render();
await esperar(30);
document.getElementById('btn-nova-nota').click();
await esperar(80);
const preencher = (id, v) => { const el = document.getElementById(id); el.value = v; disparar(el); };
document.getElementById('nf-fornecedor').value = 'forn-3';
preencher('nf-forma-pagamento', 'TED');
await esperar(20);
checar(!document.getElementById('nf-recebedor'), 'fornecedor sem recebedor alternativo: nenhum seletor');
document.getElementById('nf-fornecedor').value = 'forn-5';
preencher('nf-forma-pagamento', 'TED');
await esperar(20);
const sel = document.getElementById('nf-recebedor');
checar(!!sel && sel.value === '', 'forn-5: aparece "Quem recebe o pagamento", começando no emissor');
checar(!document.getElementById('nf-conta-bancaria'), 'com o emissor (sem conta), não há conta pra escolher');
sel.value = 'forn-0';
disparar(sel);
await esperar(20);
checarIgual((document.getElementById('nf-conta-bancaria') || {}).value, 'conta-0', 'escolhendo o recebedor, aparecem as contas DELE');

preencher('nf-emissao', '2026-07-01');
preencher('nf-vencimento', '2026-07-20');
preencher('nf-competencia', '2026-07');
document.getElementById('nf-numero').value = 'NF-REC-1';
document.getElementById('nf-valor').value = '1000';
preencher('nf-pagador', 'pag-1');
await esperar(30);
if (document.getElementById('nf-setor')) preencher('nf-setor', 'Financeiro');
preencher('nf-classificacao', 'Compras');
preencher('nf-centro-custo', 'cc-1');
await esperar(30);
preencher('nf-classe-conta', 'cl-1');
await document.getElementById('btn-salvar-nota').onclick();
await esperar(50);
const nota = supabaseClientMod.__fixtures().notas.find(n => n.numero_nota === 'NF-REC-1');
checar(!!nota, `nota salva${nota ? '' : ` (flash/erro: ${app.state.flash || document.querySelector('.toast')?.textContent})`}`);
checarIgual(nota && nota.fornecedor_recebedor_id, 'forn-0', 'a nota guarda quem recebe');
checarIgual(nota && nota.conta_bancaria_id, 'conta-0', 'e a conta bancária do recebedor');

console.log('### Detalhe, chamado e Excel ###');
const notaApp = app.notas.find(n => n.numero_nota === 'NF-REC-1');
app.state.modal = 'detalhe'; app.state.modalData = notaApp.id;
render();
await esperar(30);
checar(Array.from(document.querySelectorAll('.det-kv .k')).some(k => k.textContent.trim() === 'Recebedor do pagamento'), 'detalhe mostra "Recebedor do pagamento"');
const { resolverLabelsNota } = await import('./app/src/js/state.js');
const lbl = resolverLabelsNota(notaApp);
checar(!!lbl.recebedor_label && !!lbl.conta_bancaria_label, 'rótulos (usados no Excel) trazem o recebedor e a conta dele');
const { linhasChamado } = await import('./app/src/js/chamado_texto.js');
checar(linhasChamado([notaApp.id])[0].fornecedor.includes('NF emitida por'), 'no chamado do CSC vai quem recebe, com o emissor entre parênteses');

checarSemErrosNaoTratados(erros, 'fornecedor_recebedor_alternativo');
relatorioFinal('fornecedor_recebedor_alternativo');
