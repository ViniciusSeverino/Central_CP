// Fase de navegação (ver navItemsFor/renderNavItens em ui.js): menu em
// seções, contador que some quando a fila está vazia, âmbar só quando a
// fila tem nota atrasada, "Cancelados" sem contador (é consulta), e
// "Atualizar dados"/"Sair" no cartão do usuário.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.administrador);
const { app } = await import('./app/src/js/state.js');
const { render } = await import('./app/src/js/app.js');
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

const secoes = Array.from(document.querySelectorAll('.sb-nav .nav-secao')).map(el => el.textContent.trim());
checarIgual(secoes, ['Minha fila', 'Esteira', 'Consultas', 'Sistema'], 'menu do administrador em 4 seções');
checar(!!document.querySelector('[data-view="rascunhos"]') && document.querySelector('[data-view="rascunhos"]').textContent.includes('Rascunhos') && !document.querySelector('[data-view="rascunhos"]').textContent.includes('Meus'), 'nome padronizado: "Rascunhos" (não mais "Meus rascunhos")');
checar(document.querySelector('[data-view="cancelados"]').textContent.trim() === 'Cancelados', '"Lançamentos cancelados" vira "Cancelados", sem contador (é consulta, não fila)');

// Fila vazia: sem contador. Validar CSC não tem nota no fixture do admin.
const qtdValidar = app.notas.filter(n => n.status === 'chamado_aberto' && !n.pendente).length;
checar(qtdValidar > 0 ? !!document.querySelector('[data-view="validar_csc"] .count') : !document.querySelector('[data-view="validar_csc"] .count'), 'contador aparece só quando a fila tem nota');

// Âmbar só com atraso: deixa uma nota aprovada com vencimento futuro e
// outra com vencimento no passado, e confere a classe.
const aprovacao = app.notas.filter(n => n.status === 'lancado' && !n.pendente);
const futuro = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
aprovacao.forEach(n => { n.vencimento = futuro; n.data_chamado = null; });
render();
await esperar(20);
checar(!document.querySelector('[data-view="aprovacao"] .count').classList.contains('alerta'), 'sem nota atrasada, o contador é neutro');
aprovacao[0].vencimento = '2020-01-01';
render();
await esperar(20);
checar(document.querySelector('[data-view="aprovacao"] .count').classList.contains('alerta'), 'com nota de vencimento já passado, o contador fica âmbar');

checar(!!document.querySelector('.sb-user #btn-refresh') && !!document.querySelector('.sb-user #btn-logout'), '"Atualizar dados" e "Sair" ficam no cartão do usuário');

checarSemErrosNaoTratados(erros, 'menu_secoes_e_contadores');
relatorioFinal('menu_secoes_e_contadores');
