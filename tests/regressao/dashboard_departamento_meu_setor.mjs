// Visão geral do departamento (ver renderDashboard em ui_dashboard.js): por
// padrão mostra só o próprio setor, com "Geral" pra ver tudo; super
// usuário não tem o recorte. Os blocos dizem a que período se referem.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.departamento);
const esperar = (ms) => new Promise(r => setTimeout(r, ms));
const { app } = await import('./app/src/js/state.js');

document.querySelector('[data-view="dashboard"]').click();
await esperar(60);

const secoes = Array.from(document.querySelectorAll('.dash-secao')).map(h => h.textContent);
checar(secoes.some(t => t.startsWith('Agora')) && secoes.some(t => t.startsWith('Mês de vencimento')), 'indicadores separados em "Agora" e "Mês de vencimento"');
checar(!!document.querySelector('.dash-secao-linha #dash-mes'), 'seletor de mês fica ao lado do título do bloco que ele afeta');
checar(document.querySelector('.topbar .sub').textContent.includes('valores líquidos'), 'legenda diz que os valores são líquidos');

checar(document.querySelector('[data-dash-escopo="setor"]').classList.contains('active'), 'departamento começa vendo "Meu setor"');
// (o nome do setor passa por escapeHtml, que zera o texto no jsdom -- confere
// só que o recorte é anunciado; o nome em si aparece no navegador real)
checar(document.querySelector('.topbar .sub').textContent.includes(' · setor '), 'subtítulo anuncia que está mostrando um setor');
checar(!Array.from(document.querySelectorAll('.dash-card h3')).some(h => h.textContent === 'Volume por setor'), 'no recorte do próprio setor, "Volume por setor" (uma barra só) não aparece');
const esteiraSetor = document.querySelector('.dash-tile .dash-tile-value').textContent;

document.querySelector('[data-dash-escopo="geral"]').click();
await esperar(40);
checar(document.querySelector('[data-dash-escopo="geral"]').classList.contains('active'), '"Geral" alterna pra visão de todos os setores');
checar(Array.from(document.querySelectorAll('.dash-card h3')).some(h => h.textContent === 'Volume por setor'), 'no "Geral", "Volume por setor" volta');
checar(document.querySelector('.dash-tile .dash-tile-value').textContent !== esteiraSetor || app.notas.every(n => n.setor === app.usuario.setor), 'o valor parado na esteira muda conforme o recorte');

checarSemErrosNaoTratados(erros, 'dashboard_departamento_meu_setor');
relatorioFinal('dashboard_departamento_meu_setor');
