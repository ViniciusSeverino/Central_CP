// Fase 2 (filas em tabela compacta, ver renderTabelaNotas em ui.js): busca
// e ordenação nas filas, seleção de ação em lote que sobrevive a um
// redesenho, resumo da fila no lugar da antiga faixa de contadores, e os
// filtros de "Todas as notas" (painel "Mais filtros", etiquetas dos
// filtros ativos, filtros salvos por usuário). Usa a fila "Aguardando
// aprovação" do fixture: nota-1 (Fornecedor Teste 0, R$ 1.234,50),
// nota-7 (Fornecedor Teste 4, R$ 400,00) e nota-8 (Fornecedor Teste 5,
// R$ 900,00).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros } = await bootApp(PERFIS.gerenteFinanceiro);
const esperar = (ms) => new Promise(r => setTimeout(r, ms));
const idsNaTela = () => Array.from(document.querySelectorAll('tr.nota-row')).map(tr => tr.dataset.open);

document.querySelector('[data-view="aprovacao"]').click();
await esperar(80);

console.log('### Resumo da fila (no lugar da faixa de contadores) ###');
checar(!document.querySelector('.stat-row'), 'a faixa de 7 contadores não aparece mais na fila');
const resumo = document.querySelector('.fila-resumo').textContent;
checar(resumo.includes('3 notas') && resumo.includes('2.534,50'), `resumo mostra quantidade e total da fila ("${resumo}")`);

console.log('### Ordenação por coluna ###');
document.querySelector('[data-ordenar="aprovacao:valor"]').click();
await esperar(30);
checarIgual(idsNaTela(), ['nota-7', 'nota-8', 'nota-1'], 'clicar em "Valor" ordena do menor pro maior');
document.querySelector('[data-ordenar="aprovacao:valor"]').click();
await esperar(30);
checarIgual(idsNaTela(), ['nota-1', 'nota-8', 'nota-7'], 'clicar de novo inverte (maior pro menor)');

console.log('### Seleção sobrevive a um redesenho ###');
const cb7 = document.querySelector('.grupo-check[data-nota-id="nota-7"]');
cb7.checked = false;
cb7.dispatchEvent(new dom.window.Event('change'));
await esperar(20);
checarIgual(document.querySelector('[data-grupo-count]').textContent.trim(), '2', 'desmarcar uma nota baixa o contador pra 2');

console.log('### Busca na fila ###');
const busca = document.getElementById('f-fila-busca');
busca.value = 'teste 5';
busca.dispatchEvent(new dom.window.Event('input'));
await esperar(300);
checarIgual(idsNaTela(), ['nota-8'], 'buscar "teste 5" deixa só a nota do Fornecedor Teste 5');
checar(document.querySelector('.fila-resumo').textContent.includes('1 nota'), 'resumo acompanha a busca');
const buscaVazia = document.getElementById('f-fila-busca');
buscaVazia.value = '';
buscaVazia.dispatchEvent(new dom.window.Event('input'));
await esperar(300);
checarIgual(idsNaTela().length, 3, 'limpar a busca volta as 3 notas');
checar(!document.querySelector('.grupo-check[data-nota-id="nota-7"]').checked, 'a nota desmarcada continua desmarcada depois dos redesenhos da busca');
checarIgual(document.querySelector('[data-grupo-count]').textContent.trim(), '2', 'e o contador do botão continua em 2');

console.log('### Clicar no checkbox não abre o detalhe ###');
document.querySelector('.grupo-check[data-nota-id="nota-1"]').click();
await esperar(30);
const { app } = await import('./app/src/js/state.js');
checar(app.state.modal !== 'detalhe', 'clicar no checkbox da linha só marca/desmarca, não abre a nota');
document.querySelector('tr.nota-row[data-open="nota-1"] td:nth-child(2)').click();
await esperar(30);
checarIgual(app.state.modal, 'detalhe', 'clicar no resto da linha abre o detalhe da nota');
app.state.modal = null;

console.log('### "Todas as notas": Mais filtros, etiquetas e filtros salvos ###');
document.querySelector('[data-view="todas"]').click();
await esperar(80);
checar(document.getElementById('mais-filtros').hasAttribute('hidden'), 'painel "Mais filtros" começa fechado');
const fPag = document.getElementById('f-pagador');
fPag.value = fPag.options[1].value;
fPag.dispatchEvent(new dom.window.Event('change'));
await esperar(30);
const chip = document.querySelector('[data-limpar-filtro="pagadorId"]');
checar(!!chip, 'com o painel fechado, o filtro de pagador ativo aparece como etiqueta');
checar(document.getElementById('btn-mais-filtros').textContent.includes('(1)'), 'o botão "Mais filtros" mostra quantos filtros escondidos estão ativos');
const salvo = JSON.parse(dom.window.localStorage.getItem(`cp_filtros_todas_${app.usuario.id}`));
checarIgual(salvo && salvo.pagadorId, fPag.options[1].value, 'o filtro fica salvo no navegador, por usuário');
checar(salvo && !('dataDe' in salvo) && !('busca' in salvo), 'período padrão (ano corrente) e busca digitada não são salvos -- virando o ano, a tela não fica presa no ano anterior');
document.querySelector('[data-limpar-filtro="pagadorId"]').click();
await esperar(30);
checarIgual(app.state.filters.pagadorId, '', 'o X da etiqueta limpa só aquele filtro');
checar(!document.querySelector('[data-limpar-filtro]'), 'e a etiqueta some');
document.getElementById('btn-mais-filtros').click();
await esperar(30);
checar(!document.getElementById('mais-filtros').hasAttribute('hidden'), '"Mais filtros" abre o painel');

console.log('### Ordenação em "Todas as notas" ###');
document.querySelector('[data-ordenar="todas:valor"]').click();
await esperar(30);
const valores = Array.from(document.querySelectorAll('[data-tbl-fixa="todas-notas"] tbody tr.row-click td.num-col'))
  .map(td => Number(td.textContent.replace(/[^\d,]/g, '').replace(',', '.')));
checar(valores.length > 2 && valores.every((v, i) => i === 0 || valores[i - 1] <= v), 'clicar em "Valor bruto" ordena a tabela do menor pro maior');

checarSemErrosNaoTratados(erros, 'filas_busca_ordenacao_e_selecao');
relatorioFinal('filas_busca_ordenacao_e_selecao');
