// Lançamento em lote: uma tabela pra preencher várias notas de uma vez,
// mas cada linha vira uma nota individual ao salvar (nunca uma nota
// "agrupada"). Cobre: adicionar/remover linha, preencher os campos comuns
// direto na tabela, rateio de uma linha via o popup "Detalhes" (mesmos
// componentes do formulário individual), e o salvamento parcial (linhas
// válidas viram notas, linhas com erro ficam na tabela pra corrigir).
//
// A permissão de quem vê o botão "Lançar em lote" usa a mesma condição já
// testada pro "+ Nova nota" (departamento ou super usuário) -- não é
// lógica nova, por isso não tem um teste de permissão dedicado aqui.
//
// Ordem deliberada: preenche o Nº NF de cada linha só DEPOIS de terminar
// a volta pelo popup de Detalhes. Voltar do popup reconstrói a tabela
// inteira (é um modal de página cheia à parte) -- e o valor do campo Nº NF
// é montado com escapeHtml(), que no jsdom sempre devolve string vazia
// (mesma limitação documentada em arquivos_agrupamento_e_elegibilidade.mjs
// e no teste de fornecedor). No navegador de verdade isso não é problema
// (escapeHtml funciona), mas testar preenchendo o Nº NF antes da volta do
// popup leria de volta um campo "zerado" pelo jsdom, não um bug do app.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.departamento);
const { app } = await import('./app/src/js/state.js');

function linha(i) { return document.querySelector(`[data-lote-row="${i}"]`); }

document.getElementById('btn-lote-nota').click();
await new Promise(r => setTimeout(r, 100));
checarIgual(document.querySelectorAll('[data-lote-row]').length, 3, 'lote nasce com 3 linhas em branco');

// 1) "+ Adicionar linha" / "Remover" mexem no número de linhas.
document.getElementById('btn-lote-adicionar-linha').click();
await new Promise(r => setTimeout(r, 50));
checarIgual(document.querySelectorAll('[data-lote-row]').length, 4, 'adicionar linha soma mais uma linha em branco');
document.querySelector('[data-lote-remover="3"]').click();
await new Promise(r => setTimeout(r, 50));
checarIgual(document.querySelectorAll('[data-lote-row]').length, 3, 'remover volta pra 3 linhas');

function preencherCamposComuns(i, dados) {
  document.getElementById(`lote-numero-${i}`).value = dados.numero;
  document.getElementById(`lote-numero-${i}`).dispatchEvent(new dom.window.Event('input'));
  document.getElementById(`lote-emissao-${i}`).value = dados.emissao;
  document.getElementById(`lote-emissao-${i}`).dispatchEvent(new dom.window.Event('input'));
  document.getElementById(`lote-vencimento-${i}`).value = dados.vencimento;
  document.getElementById(`lote-vencimento-${i}`).dispatchEvent(new dom.window.Event('input'));
  document.getElementById(`lote-competencia-${i}`).value = dados.competencia;
  document.getElementById(`lote-competencia-${i}`).dispatchEvent(new dom.window.Event('input'));
  document.getElementById(`lote-valor-${i}`).value = dados.valor;
  document.getElementById(`lote-valor-${i}`).dispatchEvent(new dom.window.Event('input'));
  const selPagador = document.getElementById(`lote-pagador-${i}`);
  selPagador.value = dados.pagador;
  selPagador.dispatchEvent(new dom.window.Event('change'));
  document.getElementById(`lote-forma-pagamento-${i}`).value = dados.formaPagamento;
  document.getElementById(`lote-forma-pagamento-${i}`).dispatchEvent(new dom.window.Event('change'));
  document.getElementById(`lote-classificacao-${i}`).value = dados.classificacao;
  document.getElementById(`lote-classificacao-${i}`).dispatchEvent(new dom.window.Event('change'));
  const hiddenForn = document.getElementById(`lote-forn-${i}`);
  hiddenForn.value = dados.fornecedorId;
  const selCentro = document.getElementById(`lote-centro-custo-${i}`);
  if (selCentro) { selCentro.value = dados.centroCustoId; selCentro.dispatchEvent(new dom.window.Event('change')); }
  const selClasse = document.getElementById(`lote-classe-conta-${i}`);
  if (selClasse) { selClasse.value = dados.classeContaId; selClasse.dispatchEvent(new dom.window.Event('change')); }
}

// 2) Linha 1: só o valor bruto e o pagador (o mínimo que o popup de
// Detalhes precisa pra calcular o saldo a ratear) -- os outros campos
// comuns dessa linha entram depois, quando não há mais nenhuma volta de
// página pela frente.
document.getElementById('lote-valor-1').value = '900';
document.getElementById('lote-valor-1').dispatchEvent(new dom.window.Event('input'));
document.getElementById('lote-pagador-1').value = 'pag-2';
document.getElementById('lote-pagador-1').dispatchEvent(new dom.window.Event('change'));

linha(1).querySelector('[data-lote-detalhes="1"]').click();
await new Promise(r => setTimeout(r, 100));
checar(!!document.getElementById('nf-tem-rateio'), 'popup de Detalhes abre com o toggle de rateio');
const selTemRateio = document.getElementById('nf-tem-rateio');
selTemRateio.value = 'sim';
selTemRateio.dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
document.getElementById('rt-valor').value = '900';
document.getElementById('rt-centro').value = 'cc-2';
document.getElementById('rt-centro').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
document.getElementById('rt-classe').value = 'cl-2';
document.getElementById('btn-rateio-incluir').click();
await new Promise(r => setTimeout(r, 50));
checarIgual(app.rateioTemp.length, 1, 'incluiu a linha de rateio dentro do popup de Detalhes');
document.getElementById('btn-lote-detalhe-salvar').click();
await new Promise(r => setTimeout(r, 100));
checar(document.querySelector('[data-lote-detalhes="1"]').textContent.includes('Rateio (1)'), 'de volta na tabela, o botão Detalhes da linha 1 mostra o resumo "Rateio (1)"');
checar(document.querySelector('[data-lote-row="1"]').innerHTML.includes('Rateado'), 'a célula de centro/classe da linha 1 mostra o selo "Rateado" em vez dos selects');

// 3) Agora sim, com o popup de Detalhes já fechado (nenhuma volta de
// página pela frente), preenche o resto das linhas 0 e 1.
preencherCamposComuns(0, {
  numero: 'NF-LOTE-1', emissao: '2026-07-01', vencimento: '2026-07-08', competencia: '2026-07',
  valor: '1000', pagador: 'pag-1', formaPagamento: 'Boleto bancário', classificacao: 'Compras',
  fornecedorId: 'forn-1', centroCustoId: 'cc-1', classeContaId: 'cl-1',
});
preencherCamposComuns(1, {
  numero: 'NF-LOTE-2', emissao: '2026-07-02', vencimento: '2026-07-08', competencia: '2026-07',
  valor: '900', pagador: 'pag-2', formaPagamento: 'Boleto bancário', classificacao: 'Serviço',
  fornecedorId: 'forn-2', centroCustoId: '', classeContaId: '',
});

// 4) Linha 2 fica em branco de propósito (linha inválida).

// 5) Salvar o lote: linhas 0 e 1 (válidas) viram notas; linha 2 (inválida)
// fica na tabela com erro, sem travar as outras (salvamento parcial).
document.getElementById('btn-lote-salvar').click();
await new Promise(r => setTimeout(r, 200));

const nota1 = supabaseClientMod.__fixtures().notas.find(n => n.numero_nota === 'NF-LOTE-1');
const nota2 = supabaseClientMod.__fixtures().notas.find(n => n.numero_nota === 'NF-LOTE-2');
checar(!!nota1, 'a linha 0 (válida) virou uma nota individual de verdade');
checar(!!nota2, 'a linha 1 (válida, com rateio) também virou uma nota individual');
checarIgual(nota1 && nota1.status, 'aprovado', 'valor dentro da alçada (R$1.000) aprova automaticamente');
checar(nota1 && !nota1.tem_rateio, 'a nota 1 não tem rateio (foi lançada pelos campos comuns da tabela)');
checar(nota2 && nota2.tem_rateio, 'a nota 2 foi lançada com rateio (via Detalhes)');

const rateiosNota2 = nota2 ? supabaseClientMod.__fixtures().nota_rateios.filter(r => r.nota_id === nota2.id) : [];
checarIgual(rateiosNota2.length, 1, 'a linha de rateio da nota 2 foi persistida em nota_rateios');
checarIgual(rateiosNota2[0] && Number(rateiosNota2[0].valor), 900, 'o valor da linha de rateio bate com o valor bruto da nota 2');

checarIgual(app.loteRows.length, 1, 'só a linha inválida (linha 2, em branco) continua no lote depois de salvar');
checar(!!app.loteRows[0].erro, 'a linha que restou tem uma mensagem de erro de validação');
checar(document.querySelector('.lote-linha-erro'), 'a mensagem de erro aparece na tabela, embaixo da linha');
checar(!!document.querySelector('.toast'), 'um toast avisa quantas notas foram lançadas e quantas ficaram com erro');

checarSemErrosNaoTratados(erros, 'lote_nota_lancamento');
relatorioFinal('lote_nota_lancamento');
