// Detalhamento de impostos retidos por nota (documento WE9 -- "separar
// valor bruto, líquido e quais impostos"): checkbox "Tem retenção de
// imposto", lista de impostos itemizada (mesmo padrão do rateio), valor
// líquido sempre calculado (nunca digitado à mão).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.departamento);
const { app, TIPO_IMPOSTO_LABEL } = await import('./app/src/js/state.js');

// 1) Rótulos dos 4 impostos combinados no CSC (+ "Outro" de escape).
checarIgual(TIPO_IMPOSTO_LABEL.irrf, 'IRRF', 'rótulo de IRRF');
checarIgual(TIPO_IMPOSTO_LABEL.iss, 'ISS', 'rótulo de ISS');
checarIgual(TIPO_IMPOSTO_LABEL.pis_cofins_csll, 'PIS/COFINS/CSLL', 'rótulo combinado PIS/COFINS/CSLL');
checarIgual(TIPO_IMPOSTO_LABEL.inss, 'INSS', 'rótulo de INSS');

function preencherFormularioBase(numero, valor) {
  document.getElementById('nf-emissao').value = '2026-07-01';
  document.getElementById('nf-vencimento').value = '2026-07-08';
  document.getElementById('nf-competencia').value = '2026-07';
  document.getElementById('nf-numero').value = numero;
  document.getElementById('nf-valor').value = valor;
  document.getElementById('nf-pagador').value = 'pag-1';
  document.getElementById('nf-pagador').dispatchEvent(new dom.window.Event('change'));
  document.getElementById('nf-fornecedor').value = 'forn-1';
  document.getElementById('nf-forma-pagamento').value = 'Boleto bancário';
  document.getElementById('nf-classificacao').value = 'Compras';
  document.getElementById('nf-centro-custo').value = 'cc-1';
  document.getElementById('nf-centro-custo').dispatchEvent(new dom.window.Event('change'));
  document.getElementById('nf-classe-conta').value = 'cl-1';
}

// 2) Área de impostos começa escondida (nota nova, checkbox desmarcado).
document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));
checar(!document.getElementById('nf-tem-imposto').checked, 'checkbox "Tem retenção de imposto" começa desmarcado');
checarIgual(document.getElementById('imposto-area').innerHTML.trim(), '', 'área de impostos começa vazia (container sempre presente, conteúdo escondido)');

// 3) Marcar o checkbox abre a área -- mas ela exige valor bruto preenchido
// primeiro pra calcular o líquido (0 se ainda não digitou nada).
preencherFormularioBase('NF-IMP-1', '1000');
const chk = document.getElementById('nf-tem-imposto');
chk.checked = true;
chk.dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
checar(!!document.getElementById('btn-imposto-incluir'), 'marcar o checkbox mostra os campos de incluir imposto');
checar(document.body.textContent.includes('Valor líquido'), 'a área mostra a linha de resumo com "Valor líquido"');

// 4) Incluir um imposto: valor > 0 e dentro do bruto -- líquido recalcula
// na hora (sem round-trip, é conta local em cima do que já foi digitado).
document.getElementById('imp-tipo').value = 'irrf';
document.getElementById('imp-valor').value = '150';
document.getElementById('imp-descricao').value = 'alíquota 15%';
document.getElementById('btn-imposto-incluir').click();
await new Promise(r => setTimeout(r, 50));
checarIgual(app.impostoTemp.length, 1, 'o imposto foi incluído na lista temporária');
checarIgual(app.impostoTemp[0].tipo, 'irrf', 'tipo do imposto incluído certo');
checarIgual(app.impostoTemp[0].valor, 150, 'valor do imposto incluído certo (número, não string)');
checar(document.querySelectorAll('#imposto-area table tbody tr').length === 1, 'a tabela de impostos mostra 1 linha depois de incluir');
checar(document.body.textContent.includes('R$ 850,00') || document.body.textContent.includes('850,00'), 'valor líquido mostrado é bruto (1000) - imposto (150) = 850');

// 5) Validações: valor zerado/negativo não inclui; valor que estoura o
// bruto (deixaria o líquido negativo) também não inclui -- em ambos os
// casos mostra um toast e não crasha.
const antesDoInvalido = app.impostoTemp.length;
document.getElementById('imp-tipo').value = 'iss';
document.getElementById('imp-valor').value = '0';
document.getElementById('btn-imposto-incluir').click();
await new Promise(r => setTimeout(r, 50));
checarIgual(app.impostoTemp.length, antesDoInvalido, 'imposto com valor zero não é incluído');
checar(!!document.querySelector('.toast'), 'valor zero dispara um toast de aviso');

document.getElementById('imp-valor').value = '900'; // sobra é só 850 (1000 - 150 já incluído)
document.getElementById('btn-imposto-incluir').click();
await new Promise(r => setTimeout(r, 50));
checarIgual(app.impostoTemp.length, antesDoInvalido, 'imposto que deixaria o líquido negativo não é incluído');

// 6) Remover o imposto incluído -- líquido volta a ser o bruto inteiro.
document.querySelector('[data-imposto-remove="0"]').click();
await new Promise(r => setTimeout(r, 50));
checarIgual(app.impostoTemp.length, 0, 'remover o imposto esvazia a lista temporária');

// 7) Desmarcar o checkbox esconde a área de novo (container continua no
// DOM, só o conteúdo interno é que some -- é isso que permite o refresh
// local sem precisar de um render() completo, ver renderImpostoArea()).
chk.checked = false;
chk.dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
checarIgual(document.getElementById('imposto-area').innerHTML.trim(), '', 'desmarcar o checkbox esconde a área de novo');
checar(!!document.getElementById('imposto-area'), 'mas o container #imposto-area continua existindo no DOM');

// 8) Marcar "tem retenção" sem incluir nenhum imposto bloqueia o salvar
// (mensagem clara, sem crash).
chk.checked = true;
chk.dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
document.getElementById('btn-salvar-nota').click();
await new Promise(r => setTimeout(r, 100));
checar(document.body.textContent.includes('Inclua ao menos um imposto') || !!document.querySelector('.toast'), 'salvar com "tem retenção" marcado e sem impostos mostra aviso de validação');
checar(!supabaseClientMod.__fixtures().notas.find(n => n.numero_nota === 'NF-IMP-1'), 'a nota não foi criada enquanto a validação de impostos falhar');

// 9) Caso feliz: inclui um imposto de verdade e salva -- confere que
// tem_retencao_imposto e a lista de nota_impostos foram persistidos.
document.getElementById('imp-tipo').value = 'irrf';
document.getElementById('imp-valor').value = '150';
document.getElementById('imp-descricao').value = 'alíquota 15%';
document.getElementById('btn-imposto-incluir').click();
await new Promise(r => setTimeout(r, 50));
document.getElementById('btn-salvar-nota').click();
await new Promise(r => setTimeout(r, 150));

const notaCriada = supabaseClientMod.__fixtures().notas.find(n => n.numero_nota === 'NF-IMP-1');
checar(!!notaCriada, 'a nota foi criada depois de incluir o imposto');
checarIgual(notaCriada.tem_retencao_imposto, true, 'tem_retencao_imposto persistido como true');
const impostosSalvos = supabaseClientMod.__fixtures().nota_impostos.filter(i => i.nota_id === notaCriada.id);
checarIgual(impostosSalvos.length, 1, 'exatamente 1 linha de imposto foi gravada em nota_impostos');
checarIgual(impostosSalvos[0].tipo, 'irrf', 'tipo do imposto gravado certo');
checarIgual(Number(impostosSalvos[0].valor), 150, 'valor do imposto gravado certo');
checarIgual(impostosSalvos[0].descricao, 'alíquota 15%', 'descrição do imposto gravada certa');

// 10) Nota sem marcar "tem retenção" nenhuma nunca grava nada em
// nota_impostos (não regride pro caso comum, mais frequente).
document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));
preencherFormularioBase('NF-SEM-IMP', '300');
document.getElementById('btn-salvar-nota').click();
await new Promise(r => setTimeout(r, 150));
const notaSemImposto = supabaseClientMod.__fixtures().notas.find(n => n.numero_nota === 'NF-SEM-IMP');
checar(!!notaSemImposto, 'nota sem retenção salva normalmente');
checarIgual(notaSemImposto.tem_retencao_imposto, false, 'tem_retencao_imposto fica false quando o checkbox não é marcado');
checarIgual(supabaseClientMod.__fixtures().nota_impostos.filter(i => i.nota_id === notaSemImposto.id).length, 0, 'nenhuma linha de imposto é gravada pra nota sem retenção');

// 11) Detalhe + edição de uma nota já com retenção (fixture direta, como
// o trigger recalcular_valor_liquido_de já teria calculado no banco --
// o mock não roda triggers de Postgres, ver docs do mock).
const fixtures = supabaseClientMod.__fixtures();
fixtures.fornecedores.push({ id: 'forn-imp-teste', nome: 'Fornecedor Com Imposto', cnpj: null, municipio: 'BAURU', cod_group: null });
fixtures.notas.push({
  id: 'nota-com-imposto', numero_nota: 'NF-IMP-EXISTENTE', valor_bruto: '1000.00', valor_liquido: '850.00', descricao: 'nota com retenção',
  pagador_id: 'pag-1', fornecedor_id: 'forn-imp-teste', forma_pagamento: 'Boleto bancário',
  classificacao: 'Compras', tem_rateio: false, centro_custo_id: 'cc-1', classe_conta_id: 'cl-1',
  // rascunho -- "Continuar editando" (data-action="editar_reenviar") só
  // aparece pro dono do lançamento nesse status ou em "lancado" + pendente
  // (ver renderDetailActions em ui_nota.js).
  codigo_classificacao_id: null, status: 'rascunho', pendente: false, motivo_pendencia: null,
  setor: 'Marketing', criado_por: 'u-dept-1', criado_em: new Date().toISOString(), data_emissao: '2026-06-15', vencimento: '2026-07-15', competencia: '2026-06-01',
  aprovado_por: null, data_aprovacao: null, numero_chamado: null, data_pagamento: null,
  numero_lancamento_group: null, data_lancamento_group: null, data_validacao_csc: null, validado_por: null,
  anexo_arquivado_em: null, anexos: [], nota_rateios: [], nota_historico: [],
  tem_retencao_imposto: true,
  nota_impostos: [{ id: 'imp-existente-1', nota_id: 'nota-com-imposto', tipo: 'iss', valor: '150.00', descricao: 'ISS 5%' }],
});
// #btn-refresh só existe dentro de Configurações agora (não
// depende de estar naquela tela pra recarregar os dados no teste --
// chama a mesma função que o botão chamaria).
const { carregarTudo } = await import('./app/src/js/app.js');
await carregarTudo();
window.__render();
await new Promise(r => setTimeout(r, 150));

// status 'rascunho' só aparece na aba "Rascunhos", não em "Minhas notas".
document.querySelector('[data-view="rascunhos"]').click();
await new Promise(r => setTimeout(r, 100));
document.querySelector('.nota-card[data-open="nota-com-imposto"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 100));
checar(document.body.textContent.includes('Valor líquido'), 'detalhe da nota com retenção mostra a linha "Valor líquido"');
checar(document.body.textContent.includes('Impostos retidos'), 'detalhe mostra a seção "Impostos retidos"');
checar(document.body.textContent.includes('ISS'), 'a tabela de impostos retidos lista o tipo certo (ISS)');

// 12) Editar essa nota deve pré-carregar o checkbox marcado e a lista de
// impostos existente (mesmo padrão de app.rateioTemp no editar_reenviar).
document.querySelector('[data-action="editar_reenviar"][data-id="nota-com-imposto"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 100));
checar(document.getElementById('nf-tem-imposto').checked, 'editar nota com retenção pré-marca o checkbox');
checarIgual(app.impostoTemp.length, 1, 'editar nota com retenção pré-carrega a lista de impostos existente');
checarIgual(app.impostoTemp[0].tipo, 'iss', 'imposto pré-carregado tem o tipo certo');
checarIgual(Number(app.impostoTemp[0].valor), 150, 'imposto pré-carregado tem o valor certo');

checarSemErrosNaoTratados(erros, 'nota_impostos_e_valor_liquido');
relatorioFinal('nota_impostos_e_valor_liquido');
