// Relatório "Pesquisa de Receitas - Por Conta" do Group (ver receitas.js):
// leitura do CSV, pagador pela categoria numerada, classe sem o "*",
// grupos de receita, os dois regimes e a inadimplência por faixa.
import { checar, checarIgual, relatorioFinal } from './lib/assert.mjs';
const R = await import('./app/src/js/receitas.js');
const { tipoDoRelatorio } = await import('./app/src/js/group_importacao.js');

const CAB = ['ID', 'Instr.', 'Neg.', 'Mes Fat', 'Mes Ref', 'Seq. Cob', 'Parcela', 'Classe da Conta', 'Calculado', 'Desc.Fat.', 'Faturado', 'Baixa Parcial', 'LUC', 'Sacado', 'Tipo', 'Desc. Lcto', 'Juros Lcto', 'Correções Lcto', 'Multa Lcto', 'Desc. Baixa', 'Juros Baixa', 'Correções Baixa', 'Multa Baixa', 'Valor Liquido', 'Criação', 'Emissão', 'Ult. Emissão', 'Venc. Original', 'Vencimento', 'Recebimento', 'Liquidação', 'Situação', 'Entrada Judice', 'Saida Judice', 'Cancel Fat', 'Baixa Aut.', 'Tipo Doc', 'Tipo Lcto', 'Extra', 'Manual', 'Dt. Mov.', 'Título', 'Cheque', 'Dt Apresentação', 'Conta', 'Fase', 'Empreendimento', 'Protestada', 'Núm. Acordo', 'Descrição Boleto', 'Categoria', 'Providência', 'Usuário', 'Classificação'];
const linha = (v) => CAB.map(c => `"${String(v[c] ?? '').replace(/"/g, '""')}"`).join(';');
const csv = [CAB.map(c => `"${c}"`).join(';'),
  linha({ ID: 1, 'Mes Ref': '08/2026', 'Classe da Conta': '*ALUGUEL MÍNIMO', Faturado: '1.200,00', 'Juros Baixa': '14,00', 'Multa Baixa': '120,00', 'Valor Liquido': '1.334,00', LUC: 'DP115', Sacado: 'CACAU SHOW', 'Emissão': '01/08/2026 00:00:00', Vencimento: '05/08/2026', Recebimento: '06/09/2026', 'Situação': 'Baixada', Conta: '123198', Categoria: '3 - Empreendedores' }),
  linha({ ID: 2, 'Mes Ref': '08/2026', 'Classe da Conta': 'ENCARGO COMUM', Faturado: '2.000,00', 'Valor Liquido': '0,00', 'Emissão': '01/08/2026 00:00:00', Vencimento: '10/08/2026', 'Situação': 'Emitida', Categoria: '1 - Condomínio' }),
  linha({ ID: 3, 'Mes Ref': '10/2025', 'Classe da Conta': 'CONDOMINIO CONFISSÃO', Faturado: '500,00', 'Valor Liquido': '0,00', Vencimento: '10/01/2025', 'Situação': 'Emitida', Categoria: '1 - Condomínio' }),
  linha({ ID: 4, 'Classe da Conta': 'X', Faturado: '1,00', Categoria: '9 - Outra' }),
].join('\r\n');
const pagadores = [{ id: 'P-COND', nome: 'Condomínio', sigla: 'COND' }, { id: 'P-FPP', nome: 'FPP', sigla: 'FPP' }, { id: 'P-CONS', nome: 'Consórcio', sigla: 'CONS' }];

console.log('### Leitura ###');
checarIgual(tipoDoRelatorio(csv), 'receitas', 'cabeçalho reconhecido como relatório de receitas');
checarIgual(tipoDoRelatorio('"ID";"Movimento";"Classe de Conta"\n'), 'despesas', 'e o de despesas também');
const { receitas, categoriasSemPagador } = R.interpretarRelatorioReceitas(csv, pagadores);
checarIgual(receitas.length, 3, '3 receitas com pagador');
checarIgual(categoriasSemPagador, ['9 - Outra'], 'categoria desconhecida aparece na prévia');
checarIgual(receitas.map(r => r.pagador_id), ['P-CONS', 'P-COND', 'P-COND'], 'categoria numerada -> pagador (Empreendedores = Consórcio)');
checarIgual(receitas[0].classe, 'ALUGUEL MÍNIMO', '"*" (cobrança automática) sai da classe');
checarIgual([receitas[0].faturado, receitas[0].valor_liquido, receitas[0].juros, receitas[0].multa], [1200, 1334, 14, 120], 'valores pt-BR');
checarIgual([receitas[0].emissao, receitas[0].recebimento], ['2026-08-01', '2026-09-06'], 'datas com e sem hora');
let erro = '';
try { R.interpretarRelatorioReceitas('"ID";"Categoria"\n"1";"x"', pagadores); } catch (e) { erro = e.message; }
checar(/Pesquisa de Receitas/.test(erro), 'arquivo errado: mensagem clara');

console.log('### Grupos e regimes ###');
checarIgual(['ALUGUEL MÍNIMO', 'ENCARGO COMUM', 'CONDOMINIO CONFISSÃO', 'FUNDO DE PROMOÇÃO', 'RENDIMENTO', 'OUTRAS RECEITAS', 'ENCARGO COMUM MESES ANT.'].map(R.grupoDaReceita),
  ['alugueis', 'encargos', 'acordos', 'fundo', 'financeiras', 'outras', 'acordos'], 'grupos por regra de nome (acordo antes de encargo)');
checarIgual(R.linhasReceita(receitas, { regime: 'competencia' }).map(l => l.mes), ['2026-08', '2026-08', '2025-10'], 'competência pelo Mes Ref');
checarIgual(R.linhasReceita(receitas, { regime: 'caixa' }).map(l => [l.mes, l.valor]), [['2026-09', 1334]], 'caixa: só baixado, pelo recebimento, valor líquido');
checarIgual(R.classesDeReceita(receitas, 'P-COND'), ['CONDOMINIO CONFISSÃO', 'ENCARGO COMUM'], 'classes de um pagador, pela ordem dos grupos');

console.log('### Inadimplência ###');
const inad = R.inadimplencia(receitas, { pagadorId: 'P-COND', hoje: new Date(2026, 9, 7) });
checarIgual(inad.total, 2500, 'vencido em aberto do pagador');
checarIgual(inad.recente, 2000, 'até 90 dias (cobrável agora)');
checarIgual(inad.faixas.find(f => f.chave === 'mais').valor, 500, 'mais de 1 ano na última faixa');

relatorioFinal('receitas');
