// Visão geral › Conciliação (ver ui_conciliacao.js): linha abre o detalhe
// com as linhas do Group e as notas do Central CP, "Abrir nota" abre a
// nota sem fechar/abrir a linha, e a busca filtra.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros } = await bootApp(PERFIS.administrador);
const { app } = await import('./app/src/js/state.js');
const { render } = await import('./app/src/js/app.js');
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

const nota = app.notas.find(n => n.id === 'nota-1');
nota.numero_lancamento_group = '777';
nota.status = 'pago';
const pag = nota.pagador_id;
app.groupLancamentos = [
  { id_group: 10, movimento: '777', pagador_id: pag, valor: 1000, vencimento: '2026-09-15', criacao: '2026-09-01', pagamento: '2026-09-15', situacao: '2 - Baixada', classe_nome: 'Limpeza', classe_base: 'Limpeza', descricao: 'Limpeza setembro', fornecedor: 'LIMPA', nota_fiscal: '1', referencia: 'CONDOMÍNIO 01490-2' },
  { id_group: 11, movimento: '777', pagador_id: pag, valor: 110, vencimento: '2026-09-20', criacao: '2026-09-01', situacao: '0 - Criada', classe_nome: 'Limpeza - INSS 11%', classe_base: 'Limpeza', eh_retencao: true, fornecedor: 'LIMPA' },
  { id_group: 12, movimento: '888', pagador_id: pag, valor: 50, vencimento: '2026-09-10', descricao: 'Folha', fornecedor: 'FOPAG' },
];
app.state.view = 'dashboard'; app.state.dashboardAba = 'conciliacao';
app.state.conciliacao.grupo = 'diferente';
render(); await esperar(30);

console.log('### Linha e detalhe ###');
const tr = () => document.querySelector('tr[data-conc-toggle]');
checar(!!tr(), 'movimento com valor diferente aparece');
checar(tr().textContent.includes('15/09/2026'), 'linha mostra o pagamento (data do Group)');
checar(!document.querySelector('.conc-detalhe'), 'detalhe começa fechado');
tr().click(); await esperar(20);
const det = document.querySelector('.conc-detalhe');
checar(!!det, 'clicar na linha abre o detalhe');
const [secGrp, secCp] = det.querySelectorAll('section');
const linhasDe = (sec) => [...sec.querySelectorAll('tr')].filter(r => r.querySelector('td')).length;
checarIgual(linhasDe(secGrp), 2, 'Group: uma linha por lançamento do movimento (com a retenção)');
checar(secGrp.textContent.includes('01/09/2026') && secGrp.textContent.includes('20/09/2026'), 'Group: datas de criação e vencimento');
checarIgual(linhasDe(secCp), 1, 'Central CP: a nota do movimento');
secCp.querySelector('[data-open]').click(); await esperar(30);
checarIgual(app.state.modal, 'detalhe', '"Abrir nota" abre a nota');
checar(app.state.conciliacao.abertos.size === 1, 'abrir a nota não fecha a linha');
app.state.modal = null; render(); await esperar(20);
tr().click(); await esperar(20);
checar(!document.querySelector('.conc-detalhe'), 'clicar de novo fecha');

console.log('### Busca ###');
app.state.conciliacao.grupo = 'so_group'; render(); await esperar(20);
checarIgual(document.querySelectorAll('tr[data-conc-toggle]').length, 1, 'só no Group: movimento 888');
const busca = document.getElementById('conc-busca');
busca.value = 'limpeza'; busca.dispatchEvent(new dom.window.Event('input')); await esperar(300);
checarIgual(document.querySelectorAll('tr[data-conc-toggle]').length, 0, 'busca filtra (Folha não tem "limpeza")');
checarIgual(document.activeElement && document.activeElement.id, 'conc-busca', 'foco continua na busca depois do render');
checar(document.querySelector('[data-conc-grupo="diferente"] .conc-qtd').textContent.trim() === '1', 'contagem por situação respeita a busca');

checarSemErrosNaoTratados(erros, 'conciliacao_tela');
relatorioFinal('conciliacao_tela');
