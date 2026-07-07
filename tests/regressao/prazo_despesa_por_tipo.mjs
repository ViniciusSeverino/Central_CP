// Prazo de pagamento por tipo de despesa (documento WE9 "Processos de
// Contas a Pagar", seção "Prazo de Despesas -- Abertura de Chamado"),
// contado a partir de data_chamado: padrão D+30 corridos, CAPEX/impostos/
// allowance/FOPAG/transferência/distribuição/reembolso/benefícios/SERASA
// D+10 corridos, rescisão D+7 corridos, Google/Facebook/energia/custas
// judiciais D+3 úteis, DARE D+1 útil (confirmado com o usuário que
// Allowance fica no grupo D+10, não no D+3).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.contasAPagar);
const { calcularPrazoLimite, statusPrazo } = await import('./app/src/js/prazo_despesa.js');

// 1) Cada tipo aplica o prazo certo -- dias corridos contam todo santo
// dia, dias úteis pulam fim de semana (2026-06-05 é uma sexta-feira).
checarIgual(calcularPrazoLimite('padrao', '2026-06-01'), '2026-07-01', 'padrão: D+30 dias corridos');
checarIgual(calcularPrazoLimite('d10', '2026-06-01'), '2026-06-11', 'd10 (CAPEX/impostos/allowance/FOPAG/etc.): D+10 dias corridos');
checarIgual(calcularPrazoLimite('rescisao', '2026-06-01'), '2026-06-08', 'rescisão trabalhista: D+7 dias corridos');
checarIgual(calcularPrazoLimite('d3_util', '2026-06-05'), '2026-06-10', 'd3_util (Google/Facebook/energia/custas): D+3 dias ÚTEIS a partir de sexta -> pula o fim de semana, cai na quarta seguinte');
checarIgual(calcularPrazoLimite('dare', '2026-06-05'), '2026-06-08', 'dare: D+1 dia útil a partir de sexta -> pula pro próximo dia útil (segunda)');
checarIgual(calcularPrazoLimite('qualquer-coisa-invalida', '2026-06-01'), '2026-07-01', 'tipo desconhecido cai no prazo padrão (D+30) por segurança');
checar(!calcularPrazoLimite('padrao', null), 'sem data_chamado, não há prazo calculável (chamado ainda não foi aberto)');

// 2) statusPrazo: atrasado quando já passou do limite, com contagem certa.
const stAtrasado = statusPrazo('padrao', '2026-06-01', new Date(2026, 6, 15));
checarIgual(stAtrasado.atrasado, true, 'prazo padrão aberto em 01/06, hoje 15/07 (limite 01/07) -> atrasado');
checarIgual(stAtrasado.diasRestantes, -14, 'atrasado há exatamente 14 dias');
const stNoPrazo = statusPrazo('padrao', '2026-06-01', new Date(2026, 5, 20));
checarIgual(stNoPrazo.atrasado, false, 'prazo padrão aberto em 01/06, hoje 20/06 (limite 01/07) -> ainda no prazo');
checarIgual(stNoPrazo.diasRestantes, 11, 'faltam exatamente 11 dias');
checar(statusPrazo('padrao', null) === null, 'statusPrazo(null) não calcula nada (chamado não aberto)');

// 3) Fim a fim: injeta duas notas com chamado já aberto (uma atrasada,
// tipo DARE D+1 útil; outra dentro do prazo, tipo padrão D+30) e confere
// o selo na tela de "Todas as notas" e no detalhe.
const fixtures = supabaseClientMod.__fixtures();
const base = {
  fornecedor_id: 'forn-8', pagador_id: 'pag-1', forma_pagamento: 'Boleto bancário',
  classificacao: 'Compras', tem_rateio: false, centro_custo_id: 'cc-1', classe_conta_id: 'cl-1',
  codigo_classificacao_id: null, status: 'chamado_aberto', pendente: false, motivo_pendencia: null,
  setor: 'Marketing', criado_por: 'u-dept-1', criado_em: new Date().toISOString(),
  data_emissao: '2026-06-01', competencia: '2026-06-01', valor_bruto: '100.00',
  aprovado_por: 'u-gerente-1', data_aprovacao: new Date().toISOString(),
  numero_lancamento_group: 'GR-200', data_lancamento_group: new Date().toISOString(),
  data_validacao_csc: null, validado_por: null, data_pagamento: null,
  anexo_arquivado_em: null, anexos: [], nota_rateios: [], nota_historico: [],
};
fixtures.notas.push({
  ...base, id: 'nota-prazo-atrasada', numero_nota: 'NF-PRAZO-ATRASADA', vencimento: '2026-06-08',
  numero_chamado: 'CH-1', data_chamado: '2020-01-03T12:00:00.000Z', // sexta bem no passado -> D+1 útil já venceu há muito
  tipo_despesa_prazo: 'dare', pagamento_excecao: true,
});
fixtures.notas.push({
  ...base, id: 'nota-prazo-no-prazo', numero_nota: 'NF-PRAZO-OK', vencimento: '2026-08-05',
  numero_chamado: 'CH-2', data_chamado: new Date().toISOString(), // agora mesmo -> D+30 ainda longe de vencer
  tipo_despesa_prazo: 'padrao', pagamento_excecao: false,
});
// #btn-refresh só existe dentro de Configurações agora (não
// depende de estar naquela tela pra recarregar os dados no teste --
// chama a mesma função que o botão chamaria).
const { carregarTudo } = await import('./app/src/js/app.js');
await carregarTudo();
window.__render();
await new Promise(r => setTimeout(r, 150));

// Fila "Validar CSC" lista justamente status=chamado_aberto -- onde o
// selo de prazo/atraso faz sentido aparecer (ver prazoBadgeCard em ui.js).
document.querySelector('[data-view="validar_csc"]').click();
await new Promise(r => setTimeout(r, 100));

const cardAtrasado = document.querySelector('.nota-card[data-open="nota-prazo-atrasada"]');
checar(!!cardAtrasado, 'a nota com prazo estourado (DARE, D+1 útil aberto em 2020) aparece na fila Validar CSC');
checar(cardAtrasado.textContent.includes('Atrasado'), 'o card mostra o selo "⚠ Atrasado" pra essa nota');

const cardNoPrazo = document.querySelector('.nota-card[data-open="nota-prazo-no-prazo"]');
checar(!!cardNoPrazo, 'a nota dentro do prazo (padrão, D+30 aberto agora) aparece na fila Validar CSC');
checar(cardNoPrazo.textContent.includes('Prazo:') && !cardNoPrazo.textContent.includes('Atrasado'), 'o card dessa mostra "Prazo: Nd", não "Atrasado"');

cardAtrasado.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 100));
const linhas = Array.from(document.querySelectorAll('.k'));
// Não dá pra checar o texto de "Tipo de despesa" aqui -- ele passa por
// escapeHtml(), que zera o texto no jsdom (limitação só do ambiente de
// teste, documentada em arquivos_agrupamento_e_elegibilidade.mjs); só dá
// pra confirmar que a linha existe na estrutura.
const linhaTipo = linhas.find(el => el.textContent.trim() === 'Tipo de despesa');
checar(!!linhaTipo, 'detalhe mostra a linha "Tipo de despesa"');
const linhaChamado = linhas.find(el => el.textContent.trim() === 'Data do chamado');
checar(!!linhaChamado && linhaChamado.nextElementSibling.textContent.includes('atrasado'), 'detalhe mostra o indicador de atraso ao lado da data do chamado');

checarSemErrosNaoTratados(erros, 'prazo_despesa_por_tipo');
relatorioFinal('prazo_despesa_por_tipo');
