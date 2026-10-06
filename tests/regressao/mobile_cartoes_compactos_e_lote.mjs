// Celular (fase Caixinha e celular, ver renderCard em ui.js e
// ui_mobile.js): nota em cartão de 2 linhas sem a esteira, "Todas as
// notas" em cartões em vez da tabela larga, e "Lançar em lote" na gaveta.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros } = await bootApp({ ...PERFIS.departamento, mobile: true });
const { app } = await import('./app/src/js/state.js');
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

document.getElementById('btn-menu-mobile').click();
await esperar(50);
document.querySelector('.m-drawer-nav [data-view="todas"]').click();
await esperar(80);
const cards = document.querySelectorAll('.m-main .card-list .nota-card');
checar(cards.length > 0, `"Todas as notas" no celular vira lista de cartões (${cards.length})`);
checar(!document.querySelector('.m-main table.data-tbl'), 'sem a tabela de 11 colunas no celular');
checar(!document.querySelector('.m-main .nota-card .pipe'), 'cartão não repete a esteira (fica só no detalhe)');
const c = cards[0];
checar(!!c.querySelector('.nc-l1 .nc-valor') && !!c.querySelector('.nc-l2 .status-chip, .nc-l2 .pend-badge'), 'cartão em 2 linhas: fornecedor/valor e NF/vencimento/status');

document.getElementById('btn-menu-mobile').click();
await esperar(50);
checar(!!document.querySelector('.m-drawer #btn-lote-nota'), '"Lançar em lote" fica na gaveta');
document.getElementById('btn-lote-nota').click();
await esperar(80);
checarIgual(app.state.modal, 'lote_nota', '"Lançar em lote" abre o lançamento em lote');
checar(!document.querySelector('.m-drawer.open'), 'a gaveta fecha ao abrir o lote');

checarSemErrosNaoTratados(erros, 'mobile_cartoes_compactos_e_lote');
relatorioFinal('mobile_cartoes_compactos_e_lote');
