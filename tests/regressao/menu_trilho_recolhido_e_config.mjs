// Barra lateral recolhida vira trilho de ícones (antes era uma tirinha de
// 10px que cortava os botões) e o submenu de Configurações ganha ícone
// por item, pra não se confundir com os títulos de grupo.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.administrador);
const { app } = await import('./app/src/js/state.js');
const { render } = await import('./app/src/js/app.js');
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

const itens = Array.from(document.querySelectorAll('.sb-nav [data-view]'));
checar(itens.every(b => b.querySelector('svg.ic') && b.querySelector('.nav-label')), `todo item do menu tem ícone e rótulo (${itens.length})`);
checar(itens.every(b => b.getAttribute('title')), 'todo item tem dica (title) -- é o que aparece com a barra recolhida');
checarIgual(document.querySelector('[data-view="cancelados"]').textContent.trim(), 'Cancelados', 'o texto do item continua só o rótulo');

document.getElementById('btn-sidebar-toggle').click();
await esperar(30);
checar(app.state.sidebarRecolhida && document.querySelector('.sidebar.recolhida') && document.querySelector('.shell.sb-recolhida'), 'recolher marca a barra e o shell (o conteúdo ganha a margem do trilho)');
checar(!!document.querySelector('.sidebar.recolhida .sb-avatar'), 'trilho mostra as iniciais do usuário');
checar(!!document.querySelector('.sidebar.recolhida #btn-nova-nota svg.ic') && !!document.querySelector('.sidebar.recolhida #btn-nova-nota .sb-acao-label'), '"Nova nota" tem ícone (trilho) e rótulo (barra aberta)');
checar(!!document.querySelector('.sidebar.recolhida #btn-sidebar-toggle'), 'o botão de recolher/expandir fica dentro da barra');
document.getElementById('btn-sidebar-toggle').click();
await esperar(30);
checar(!app.state.sidebarRecolhida && !document.querySelector('.sidebar.recolhida'), 'expandir volta ao normal');

console.log('### Submenu de Configurações ###');
app.state.view = 'cadastros';
render();
await esperar(30);
const botoes = Array.from(document.querySelectorAll('.config-nav button'));
checar(botoes.length > 0 && botoes.every(b => b.querySelector('svg.ic')), `todo item do submenu tem ícone (${botoes.length})`);
checar(Array.from(document.querySelectorAll('.config-nav-titulo')).every(t => !t.querySelector('svg')), 'títulos de grupo não têm ícone (não são clicáveis)');

checarSemErrosNaoTratados(erros, 'menu_trilho_recolhido_e_config');
// Recolhida abre só pela setinha: passar o mouse não expande mais.
const { readFileSync } = await import('fs');
const css = readFileSync(new URL('../../src/css/styles.css', import.meta.url), 'utf8');
checar(!/\.sidebar\.recolhida:hover/.test(css) && !/recolhida:not\(:hover\)/.test(css), 'barra recolhida não abre no hover (só pela setinha)');

relatorioFinal('menu_trilho_recolhido_e_config');
