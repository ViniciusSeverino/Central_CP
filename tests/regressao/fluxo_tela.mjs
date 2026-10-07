// Visão geral › Fluxo de caixa (ver ui_fluxo.js): aba só do administrador,
// saldo informado e gravado, entradas expansíveis, quadro de inadimplência.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.administrador);
const { app } = await import('./app/src/js/state.js');
const { render } = await import('./app/src/js/app.js');
const esperar = (ms) => new Promise(r => setTimeout(r, ms));
const ano = new Date().getFullYear();
const pag = app.cadastros.pagadores.find(p => p.sigla === 'CONS');

app.state.view = 'dashboard'; app.state.dashboardAba = 'fluxo'; render(); await esperar(20);
checar(!!document.querySelector('[data-dash-aba="fluxo"].active') && !!document.querySelector('.empty-state'), 'sem relatórios do Group: aviso pra importar');

app.groupReceitas = [
  { id_group: 1, pagador_id: pag.id, classe: 'ALUGUEL MÍNIMO', situacao: 'Baixada', recebimento: `${ano}-01-10`, valor_liquido: 5000, faturado: 5000, vencimento: `${ano}-01-05`, sacado: 'LOJA A', luc: 'L1' },
  { id_group: 2, pagador_id: pag.id, classe: 'ENCARGO COMUM', situacao: 'Emitida', faturado: 800, vencimento: `${ano - 2}-01-05`, sacado: 'LOJA B', luc: 'L2' },
];
app.groupLancamentos = [{ id_group: 9, pagador_id: pag.id, movimento: '9', centro_nome: 'OPERACIONAIS', classe_base: 'X', situacao: '2 - Baixada', pagamento: `${ano}-01-20`, valor: 2000 }];
render(); await esperar(20);
checar(!document.querySelector('[data-dre-regime]'), 'fluxo de caixa não tem seletor de regime (é sempre caixa)');
checar(!!document.getElementById('fluxo-saldo-valor'), 'sem saldo informado: formulário do saldo aberto');
checarIgual(document.querySelectorAll('.fluxo-cg .dre-cg-mes').length, 12, 'gráfico: 12 meses');
checarIgual(document.querySelectorAll('.fluxo-tabela thead th.dre-mes').length, 12, 'tabela: 12 meses');
checar(document.querySelectorAll('.fluxo-faixa').length === 5 && document.querySelectorAll('.fluxo-inad tbody tr').length >= 1, 'inadimplência: 5 faixas e o maior devedor');

document.getElementById('fluxo-saldo-mes').value = `${ano}-01`;
document.getElementById('fluxo-saldo-valor').value = '10000';
document.getElementById('btn-salvar-saldo').click(); await esperar(60);
const gravado = (supabaseClientMod.__fixtures().fluxo_saldo_inicial || []);
checar(gravado.length === 1 && gravado[0].pagador_id === pag.id && gravado[0].data === `${ano}-01-01` && Number(gravado[0].valor) === 10000, 'saldo gravado no início do mês, por pagador');
checar(!document.getElementById('fluxo-saldo-valor') && !!document.getElementById('btn-editar-saldo'), 'depois de salvar, o cartão mostra o saldo com "Alterar"');
const linhas = Array.from(document.querySelectorAll('.fluxo-tabela tbody tr'));
checar(linhas[0].classList.contains('dre-subtotal') && linhas[linhas.length - 1].classList.contains('dre-resultado') && linhas.length === 5, 'com saldo: linhas de saldo inicial e final (5 linhas)');
document.querySelector('[data-fluxo-toggle="entradas"]').click(); await esperar(20);
checar(document.querySelectorAll('.fluxo-tabela tr.dre-n2').length >= 1, 'entradas abrem por grupo de receita');
document.getElementById('btn-editar-saldo').click(); await esperar(20);
checar(!!document.getElementById('fluxo-saldo-valor'), '"Alterar saldo" reabre o formulário');

checarSemErrosNaoTratados(erros, 'fluxo_tela');
relatorioFinal('fluxo_tela');
