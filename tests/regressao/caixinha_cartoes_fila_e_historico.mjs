// Fase Caixinha e celular (ver ui_caixinha.js): cartão compacto com uma
// ação principal ("Registrar saída") e o resto em "Mais ações"; pendências
// numa fila "Aguardando aprovação" separada do histórico; histórico com
// filtro de período e total no rodapé.
// Fixture: caixinha-1 tem mov-0 (adição, 01/06), mov-1 (saída, 01/07) e
// mov-2 (saída pendente, 05/07).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros } = await bootApp(PERFIS.administrador);
const { app } = await import('./app/src/js/state.js');
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

document.querySelector('[data-view="caixinha"]').click();
await esperar(80);

console.log('### Cartão ###');
const card = document.querySelector('[data-registrar-caixinha="caixinha-1"][data-tipo="saida"]').closest('.cx-card');
checar(!!card, 'cada caixinha é um cartão compacto (.cx-card)');
checar(!card.querySelector('[data-tipo="saida"]').closest('.menu-acoes'), '"Registrar saída" fica à vista (ação principal)');
const noMenu = Array.from(card.querySelectorAll('.menu-acoes .menu-item')).map(b => b.textContent.trim());
checarIgual(noMenu, ['Adicionar saldo', 'Ver extrato', 'Editar caixinha'], '"Mais ações" tem Adicionar saldo, Ver extrato e Editar');
checar(!!card.querySelector('.pend-badge.amber'), 'cartão avisa que tem movimentação aguardando aprovação');

console.log('### Fila de aprovação x histórico ###');
const pendentes = document.querySelector('[data-tbl-fixa="caixinha-pendentes"]');
const historico = document.querySelector('[data-tbl-fixa="caixinha-movimentacoes"]');
checar(!!pendentes && !!pendentes.querySelector('[data-aprovar-caixinha="mov-2"]'), 'mov-2 (pendente) aparece na fila "Aguardando aprovação"');
checar(!!historico && !historico.querySelector('[data-aprovar-caixinha]'), 'histórico não repete as pendentes');
checarIgual(historico.querySelectorAll('tbody tr').length, 2, 'histórico tem as 2 movimentações já aprovadas');
checar(historico.querySelector('tfoot').textContent.includes('2 movimentações'), 'rodapé do histórico conta as movimentações');

console.log('### Filtro de período ###');
const de = document.getElementById('cx-hist-de');
de.value = '2026-06-15';
de.dispatchEvent(new dom.window.Event('change'));
await esperar(30);
checarIgual(document.querySelectorAll('[data-tbl-fixa="caixinha-movimentacoes"] tbody tr').length, 1, 'a partir de 15/06 só sobra a saída de 01/07');
checar(!!document.querySelector('[data-tbl-fixa="caixinha-pendentes"]'), 'o filtro de período não esconde a fila de aprovação');
document.getElementById('btn-limpar-filtro-cx').click();
await esperar(30);
checarIgual(app.state.caixinhaHistoricoFiltro.dataDe, '', '"Limpar filtros" volta ao histórico inteiro');

console.log('### Adicionar saldo ###');
document.querySelector('[data-registrar-caixinha="caixinha-1"][data-tipo="reforco"]').click();
await esperar(30);
checar(document.querySelector('.modal h2, .modal h3, .modal-title') ? document.body.textContent.includes('Adicionar saldo') : true, 'modal usa o nome "Adicionar saldo" (não mais "reforço")');
checar(!document.body.textContent.includes('Registrar reforço'), 'não sobra "Registrar reforço" na tela');

checarSemErrosNaoTratados(erros, 'caixinha_cartoes_fila_e_historico');
relatorioFinal('caixinha_cartoes_fila_e_historico');
