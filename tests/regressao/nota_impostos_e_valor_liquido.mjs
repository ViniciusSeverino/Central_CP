// Retenção de imposto: só o "Valor líquido" é digitado -- o valor do
// imposto é sempre a diferença (bruto - líquido), calculada
// automaticamente, sem precisar detalhar o tipo (decisão do dono do
// produto: o que importa é o total pra provisionar, ver
// impostosAProvisionarNoMes em dashboard.js). Internamente continua
// guardado como 1 linha em nota_impostos (tipo 'outro') -- valor líquido
// da nota em si sempre calculado no banco (nunca digitado à mão).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.departamento);
const { app, TIPO_IMPOSTO_LABEL } = await import('./app/src/js/state.js');

// 1) Rótulos dos 4 impostos combinados no CSC (+ "Outro" de escape) --
// continuam existindo pra exibir o detalhe de notas antigas já
// itemizadas, mesmo o formulário de lançar não pedindo mais o tipo.
checarIgual(TIPO_IMPOSTO_LABEL.irrf, 'IRRF', 'rótulo de IRRF');
checarIgual(TIPO_IMPOSTO_LABEL.iss, 'ISS', 'rótulo de ISS');
checarIgual(TIPO_IMPOSTO_LABEL.pis_cofins_csll, 'PIS/COFINS/CSLL', 'rótulo combinado PIS/COFINS/CSLL');
checarIgual(TIPO_IMPOSTO_LABEL.inss, 'INSS', 'rótulo de INSS');
checarIgual(TIPO_IMPOSTO_LABEL.outro, 'Outro', 'rótulo de "Outro" -- é o que o imposto calculado automaticamente usa');

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

// 3) Marcar o checkbox abre a área -- só um campo, "Valor líquido".
preencherFormularioBase('NF-IMP-1', '1000');
const chk = document.getElementById('nf-tem-imposto');
chk.checked = true;
chk.dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
checar(!!document.getElementById('imp-liquido'), 'marcar o checkbox mostra o campo "Valor líquido"');
checar(document.body.textContent.includes('Valor líquido'), 'o rótulo do campo é "Valor líquido"');
checar(!document.getElementById('imp-tipo'), 'não pede mais tipo de imposto (não é mais itemizado)');

// 4) Digitar o valor líquido calcula o imposto automaticamente (bruto -
// líquido), sem precisar de um botão "incluir" nem escolher um tipo.
const liq = document.getElementById('imp-liquido');
liq.value = '850';
liq.dispatchEvent(new dom.window.Event('input'));
await new Promise(r => setTimeout(r, 30));
checarIgual(app.impostoTemp.length, 1, 'digitar o líquido gera 1 item na lista interna de impostos');
checarIgual(app.impostoTemp[0].tipo, 'outro', 'tipo é sempre "outro" (calculado, não detalhado)');
checarIgual(app.impostoTemp[0].valor, 150, 'valor do imposto calculado certo (1000 - 850 = 150)');
checar(document.body.textContent.includes('150,00'), 'o resumo mostra o imposto calculado (R$ 150,00)');

// 5) Validações: líquido igual ao bruto zera o imposto (sem erro -- é só
// "não tem retenção de verdade"); líquido maior que o bruto avisa e some
// com o imposto calculado (não deixa negativo).
liq.value = '1000';
liq.dispatchEvent(new dom.window.Event('input'));
await new Promise(r => setTimeout(r, 30));
checarIgual(app.impostoTemp.length, 0, 'líquido igual ao bruto zera o imposto calculado (nenhuma linha gerada)');

liq.value = '1100';
liq.dispatchEvent(new dom.window.Event('input'));
await new Promise(r => setTimeout(r, 30));
checar(!!document.querySelector('.toast'), 'líquido maior que o bruto mostra um toast de aviso');
checarIgual(app.impostoTemp.length, 0, 'líquido maior que o bruto não deixa nenhum imposto calculado (não fica negativo)');

// 6) Esvaziar o campo também zera o imposto calculado.
liq.value = '850';
liq.dispatchEvent(new dom.window.Event('input'));
await new Promise(r => setTimeout(r, 30));
checarIgual(app.impostoTemp.length, 1, 'confirma que o líquido válido (850) recalcula o imposto de novo');
liq.value = '';
liq.dispatchEvent(new dom.window.Event('input'));
await new Promise(r => setTimeout(r, 30));
checarIgual(app.impostoTemp.length, 0, 'esvaziar o campo líquido esvazia a lista de impostos');

// 7) Desmarcar o checkbox esconde a área de novo (container continua no
// DOM, só o conteúdo interno é que some -- é isso que permite o refresh
// local sem precisar de um render() completo, ver renderImpostoArea()).
chk.checked = false;
chk.dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
checarIgual(document.getElementById('imposto-area').innerHTML.trim(), '', 'desmarcar o checkbox esconde a área de novo');
checar(!!document.getElementById('imposto-area'), 'mas o container #imposto-area continua existindo no DOM');

// 8) Marcar "tem retenção" sem digitar um líquido que gere imposto
// bloqueia o salvar (mensagem clara, sem crash) -- mesma validação de
// antes, só que agora reflete o campo novo.
chk.checked = true;
chk.dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
document.getElementById('btn-salvar-nota').click();
await new Promise(r => setTimeout(r, 100));
checar(document.body.textContent.includes('Inclua ao menos um imposto') || !!document.querySelector('.toast'), 'salvar com "tem retenção" marcado e sem imposto calculado mostra aviso de validação');
checar(!supabaseClientMod.__fixtures().notas.find(n => n.numero_nota === 'NF-IMP-1'), 'a nota não foi criada enquanto a validação de impostos falhar');

// 9) Caso feliz: digita um líquido válido e salva -- confere que
// tem_retencao_imposto e a linha em nota_impostos foram persistidos.
document.getElementById('imp-liquido').value = '850';
document.getElementById('imp-liquido').dispatchEvent(new dom.window.Event('input'));
await new Promise(r => setTimeout(r, 30));
document.getElementById('btn-salvar-nota').click();
await new Promise(r => setTimeout(r, 150));

const notaCriada = supabaseClientMod.__fixtures().notas.find(n => n.numero_nota === 'NF-IMP-1');
checar(!!notaCriada, 'a nota foi criada depois de digitar o líquido');
checarIgual(notaCriada.tem_retencao_imposto, true, 'tem_retencao_imposto persistido como true');
const impostosSalvos = supabaseClientMod.__fixtures().nota_impostos.filter(i => i.nota_id === notaCriada.id);
checarIgual(impostosSalvos.length, 1, 'exatamente 1 linha de imposto foi gravada em nota_impostos');
checarIgual(impostosSalvos[0].tipo, 'outro', 'tipo do imposto gravado é "outro" (calculado)');
checarIgual(Number(impostosSalvos[0].valor), 150, 'valor do imposto gravado certo (1000 - 850)');

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
// o mock não roda triggers de Postgres, ver docs do mock). Nota
// "antiga", itemizada com tipo 'iss' -- continua aparecendo certinho no
// detalhe mesmo o formulário novo não pedindo mais tipo.
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
checar(document.body.textContent.includes('ISS'), 'a tabela de impostos retidos lista o tipo certo (ISS), preservado de antes da mudança');

// 12) Editar essa nota deve pré-carregar o checkbox marcado e o campo
// líquido já calculado a partir da lista de impostos existente (mesmo
// padrão de app.rateioTemp no editar_reenviar).
document.querySelector('[data-action="editar_reenviar"][data-id="nota-com-imposto"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 100));
checar(document.getElementById('nf-tem-imposto').checked, 'editar nota com retenção pré-marca o checkbox');
checarIgual(app.impostoTemp.length, 1, 'editar nota com retenção pré-carrega a lista de impostos existente');
checarIgual(app.impostoTemp[0].tipo, 'iss', 'imposto pré-carregado preserva o tipo original (iss), só não pede mais pra editar por tipo');
checarIgual(Number(app.impostoTemp[0].valor), 150, 'imposto pré-carregado tem o valor certo');
checarIgual(document.getElementById('imp-liquido').value, '850', 'campo "Valor líquido" já vem calculado (1000 - 150) a partir do imposto existente');

checarSemErrosNaoTratados(erros, 'nota_impostos_e_valor_liquido');
relatorioFinal('nota_impostos_e_valor_liquido');
