// Relatório "Pesquisa de Despesas" do Group (ver group_importacao.js):
// CSV latin1 com ";" e aspas, valores pt-BR, retenções somando na conta
// da despesa, pagador pela Categoria, casamento por nome com o plano do
// Central CP e de-para manual.
import { checar, checarIgual, relatorioFinal } from './lib/assert.mjs';
const g = await import('./app/src/js/group_importacao.js');

const CAB = '"ID";"Filial";"Mes Ref.";"Empenho";"Cod. Classe";"Classe de Conta";"Cod. CC";"Centro de Custo";"Empreendedor";"Fornecedor";"Favorecido";"Valor";"Vencimento";"Criação";"Pagamento";"Liquidação";"Juros";"Multa";"Correções";"Taxas";"Desconto";"Valor Pago";"Nº Cont. Corr.";"Conta Corrente";"Referencia";"Conta Débito";"Tipo Doc Pgto";"Cheque";"Talão";"Nota Fiscal";"Parcela";"Situacao";"Reembolso";"Movimento";"Tipo Despesa";"Descrição";"Borderô";"Documento";"Borderô Elet.";"Nº Est. Ger.";"Nº Estorno";"Linha Digitável";"Conta Orig.";"Sistema Origem";"Compr/Serv";"Código";"Categoria"';
const q = (s) => String(s).replace(/"/g, '""');
const linha = (id, classe, cc, centro, forn, valor, venc, pag, situacao, mov, cat) =>
  `"${id}";"BSB";"09/2026";"";"1";"${classe}";"${cc}";"${centro}";"";"${q(forn)}";"${q(forn)}";"${valor}";"${venc}";"01/09/2026";"${pag}";"";"0,00";"0,00";"0,00";"0,00";"0,00";"${valor}";"";"";"";"";"BE";"";"";"123";"";"${situacao}";"";"${mov}";"";"";"";"";"";"";"";"";"";"Group Shopping";"";"";"${cat}"`;
const csv = [CAB,
  linha(1, 'Limpeza e Conservação Terceirizada', '005', 'LIMPEZA E CONSERVAÇÃO', 'LIMPA "BEM" LTDA', '164.840,48', '14/10/2026', '', ' 0 - Criada', '2546', 'Condomínio'),
  linha(2, 'Limpeza e Conservação Terceirizada - INSS 11%', '005', 'LIMPEZA E CONSERVAÇÃO', 'LIMPA "BEM" LTDA', '22.289,43', '20/10/2026', '', ' 0 - Criada', '2546', 'Condomínio'),
  linha(3, 'Salários', '01', 'ADMINISTRATIVO', 'FOPAG', '1.000,00', '30/09/2026', '30/09/2026', ' 2 - Baixada', '1897', 'Condomínio'),
  linha(4, 'Coisa Que Não Existe', '01', 'ADMINISTRATIVO', 'X', '50,00', '30/09/2026', '', ' 0 - Criada', '1898', 'Condomínio'),
  linha(5, 'Natal', '216', 'NATAL', 'Y', '10,00', '30/09/2026', '', ' 0 - Criada', '1899', 'Fundo de Promoção'),
  linha(6, 'Qualquer', '001', 'X', 'Z', '1,00', '30/09/2026', '', ' 0 - Criada', '1900', 'Categoria Nova'),
].join('\r\n');

const cadastros = {
  pagadores: [{ id: 'P-COND', nome: 'Condomínio', sigla: 'COND' }, { id: 'P-FPP', nome: 'FPP', sigla: 'FPP' }, { id: 'P-CONS', nome: 'Consórcio', sigla: 'CONS' }],
  centros_custo: [
    { id: 'C-ADM', codigo: '2.01', nome: 'ADMINISTRATIVO', origem_siglas: ['COND', 'CONS'] },
    { id: 'C-LIMP', codigo: '2.05', nome: 'LIMPEZA E CONSERVAÇÃO', origem_siglas: ['COND', 'CONS'] },
    { id: 'C-NATAL', codigo: '2.16', nome: 'NATAL', origem_siglas: ['FPP'] },
  ],
  classes_conta: [
    { id: 'K-SAL', codigo: '2.01.01.01', nome: 'SALARIOS E ORDENADOS', centro_custo_id: 'C-ADM' },
    { id: 'K-TERC', codigo: '2.05.07.01', nome: 'SERVIÇOS TERCEIRIZADOS', centro_custo_id: 'C-LIMP' },
    { id: 'K-NAT', codigo: '2.16.01.01', nome: 'NATAL', centro_custo_id: 'C-NATAL' },
  ],
  codigos_classificacao: [
    { id: 'X-SAL', codigo: '2.01.01.01.0011', nome: 'Salários', classe_conta_id: 'K-SAL' },
    { id: 'X-LIMP', codigo: '2.05.07.01.0001', nome: 'Limpeza e Conservação Terceirizada', classe_conta_id: 'K-TERC' },
  ],
};

console.log('### Leitura ###');
const { lancamentos, categoriasSemPagador } = g.interpretarRelatorioGroup(csv, cadastros.pagadores);
checarIgual(lancamentos.length, 5, '5 linhas com pagador reconhecido');
checarIgual(categoriasSemPagador, ['Categoria Nova'], 'categoria sem pagador aparece na prévia');
checarIgual(lancamentos[0].fornecedor, 'LIMPA "BEM" LTDA', 'aspas duplicadas dentro do campo');
checarIgual(lancamentos[0].valor, 164840.48, 'valor pt-BR');
checarIgual(lancamentos[0].vencimento, '2026-10-14', 'data dd/mm/aaaa');
checar(lancamentos[1].eh_retencao && lancamentos[1].classe_base === 'Limpeza e Conservação Terceirizada', 'retenção: sufixo de imposto sai da classe');
checarIgual(lancamentos.find(l => l.movimento === '1899').pagador_id, 'P-FPP', 'Fundo de Promoção -> FPP');
checarIgual(g.classeBase('Treinamento - Externo').base, 'Treinamento - Externo', 'hífen que não é imposto não corta o nome');

console.log('### Casamento ###');
const casar = g.criarCasador(cadastros, []);
checarIgual(casar(lancamentos[0]).codigoId, 'X-LIMP', 'centro + código pelo nome');
checarIgual(casar(lancamentos[1]).codigoId, 'X-LIMP', 'retenção cai na mesma conta');
checarIgual(casar(lancamentos[2]).codigoId, 'X-SAL', 'centro com código diferente no Group (01) casa pelo nome');
checar(casar(lancamentos[3]).soCentro && !casar(lancamentos[3]).codigoId, 'classe desconhecida: só o centro casa');
checarIgual(casar(lancamentos.find(l => l.movimento === '1899')).classeId, 'K-NAT', 'sem código igual, casa pela classe');
const r = g.resumoImportacao(lancamentos, cadastros, []);
checarIgual(r.semCasamento.map(x => x.classe_base), ['Coisa Que Não Existe'], 'prévia lista o par sem conta');
const comDePara = g.criarCasador(cadastros, [{ pagador_id: 'P-COND', centro_nome: 'ADMINISTRATIVO', classe_base: 'coisa que não existe', codigo_classificacao_id: 'X-SAL' }]);
checarIgual(comDePara(lancamentos[3]).codigoId, 'X-SAL', 'de-para manual resolve (sem diferenciar maiúsculas)');

relatorioFinal('group_importacao');
