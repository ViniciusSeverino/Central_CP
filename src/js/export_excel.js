// src/js/export_excel.js
//
// Exporta a lista de notas (já filtrada pela tela "Todas as notas") para um
// .xlsx pronto pra analisar — sem precisar ajustar largura de coluna, tipo
// de dado ou cor na mão depois de abrir no Excel.
//
// Abas:
//   "Notas"                       — uma linha por nota (visão operacional,
//                                    esteira/status/datas/códigos, já com
//                                    valor líquido quando há retenção).
//   "Rateio por Centro de Custo"  — uma linha por alocação de custo. Nota
//                                    sem rateio também entra aqui como uma
//                                    linha só (com o centro/classe/código
//                                    dela e o valor bruto inteiro), pra essa
//                                    aba somar 100% do valor exportado, não
//                                    só as notas rateadas.
//   "Impostos Retidos"            — uma linha por imposto retido (só notas
//                                    com tem_retencao_imposto entram aqui).
// mais um resumo pré-calculado por centro de custo (última aba), já que
// gerar esse subtotal manualmente na aba de detalhe quebraria o autofiltro.
import { STATUS_LABEL, resolverLabelsNota, resolverLabelsRateio, nomeUsuario, app, TIPO_IMPOSTO_LABEL } from './state.js';

// Mesmas cores da esteira na tela (ver :root em styles.css), em ARGB pro
// Excel — CSS var() não existe fora do navegador, então duplicamos aqui.
const STATUS_FILL_ARGB = {
  rascunho: 'FFECEBE4',
  lancado: 'FFECEBE4',
  aprovado: 'FFE3EEEB',
  lancado_no_group: 'FFE3EEEB',
  chamado_aberto: 'FFFBEEDC',
  validado_csc: 'FFE1E9F7',
  pago: 'FFE5F1E9',
  cancelada: 'FFFAE7DD',
};
const STATUS_FONT_ARGB = {
  rascunho: 'FF5B6B63',
  lancado: 'FF5B6B63',
  aprovado: 'FF0F5C52',
  lancado_no_group: 'FF0A4038',
  chamado_aberto: 'FFC97A1F',
  validado_csc: 'FF2E5EAA',
  pago: 'FF2E7D52',
  cancelada: 'FFB3431F',
};

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F5C52' } };
const HEADER_FONT = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 };
const THIN_BORDER = { style: 'thin', color: { argb: 'FFDCDCD2' } };
const BORDER_ALL = { top: THIN_BORDER, left: THIN_BORDER, bottom: THIN_BORDER, right: THIN_BORDER };
const MONEY_FMT = '"R$" #,##0.00';
const DATE_FMT = 'dd/mm/yyyy';

function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function estilizarCabecalho(sheet) {
  const header = sheet.getRow(1);
  header.eachCell(cell => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = BORDER_ALL;
  });
  header.height = 22;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
}

function bordejarLinhas(sheet) {
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell({ includeEmpty: true }, cell => { cell.border = BORDER_ALL; });
  });
}

function montarAbaNotas(workbook, notas) {
  const sheet = workbook.addWorksheet('Notas');
  sheet.columns = [
    { header: 'Nº NF', key: 'numero_nota', width: 14 },
    { header: 'Fornecedor', key: 'fornecedor', width: 30 },
    { header: 'CNPJ', key: 'cnpj', width: 18 },
    { header: 'Pagador', key: 'pagador', width: 16 },
    { header: 'Setor solicitante', key: 'setor', width: 16 },
    { header: 'Data emissão', key: 'data_emissao', width: 13, style: { numFmt: DATE_FMT } },
    { header: 'Vencimento', key: 'vencimento', width: 13, style: { numFmt: DATE_FMT } },
    { header: 'Competência', key: 'competencia', width: 13, style: { numFmt: 'mm/yyyy' } },
    // Nota com rateio vira uma linha por item rateado — "Valor da linha"
    // é o valor daquele centro de custo específico, não o total da nota
    // (some por Nº NF pra recuperar o total; a soma bate exatamente com o
    // valor bruto porque o banco garante isso, ver trigger
    // validar_soma_rateio_de em supabase/migrations/0009_rls_rateios_historico.sql).
    { header: 'Valor da linha', key: 'valor_bruto', width: 15, style: { numFmt: MONEY_FMT } },
    // Repetido em cada linha rateada (assim como Fornecedor/CNPJ) -- é um
    // dado da nota como um todo, não de uma alocação de custo específica.
    { header: 'Tem retenção de imposto', key: 'tem_retencao_imposto', width: 12 },
    { header: 'Valor líquido', key: 'valor_liquido', width: 15, style: { numFmt: MONEY_FMT } },
    { header: 'Forma de pagamento', key: 'forma_pagamento', width: 16 },
    { header: 'Conta bancária', key: 'conta_bancaria', width: 28 },
    { header: 'Classificação', key: 'classificacao', width: 14 },
    { header: 'Centro de custo', key: 'centro_custo', width: 26 },
    { header: 'Classe da conta', key: 'classe_conta', width: 24 },
    { header: 'Código classificação', key: 'codigo_classificacao', width: 24 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Pendente', key: 'pendente', width: 10 },
    { header: 'Motivo da pendência', key: 'motivo_pendencia', width: 30 },
    { header: 'Solicitado por', key: 'solicitado_por', width: 20 },
    { header: 'Aprovado por', key: 'aprovado_por', width: 20 },
    { header: 'Data aprovação', key: 'data_aprovacao', width: 15, style: { numFmt: DATE_FMT } },
    { header: 'Nº lançamento Group', key: 'numero_lancamento_group', width: 18 },
    { header: 'Data lançamento Group', key: 'data_lancamento_group', width: 17, style: { numFmt: DATE_FMT } },
    { header: 'Nº chamado Acelerato', key: 'numero_chamado', width: 18 },
    { header: 'Data chamado', key: 'data_chamado', width: 14, style: { numFmt: DATE_FMT } },
    { header: 'Data validação CSC', key: 'data_validacao_csc', width: 16, style: { numFmt: DATE_FMT } },
    { header: 'Validado por', key: 'validado_por', width: 20 },
    { header: 'Data pagamento', key: 'data_pagamento', width: 14, style: { numFmt: DATE_FMT } },
  ];

  notas.forEach(n => {
    const lbl = resolverLabelsNota(n);
    const forn = app.cadastros.fornecedores.find(f => f.id === n.fornecedor_id);
    // Sem rateio: 1 linha, com os dados da própria nota. Com rateio: 1
    // linha por item — `r` é null no caso sem rateio, marcando "usa os
    // dados da nota mesmo" pros campos de classificação/valor.
    const itens = (n.tem_rateio && n.rateios && n.rateios.length > 0) ? n.rateios : [null];

    itens.forEach(r => {
      const rl = r ? resolverLabelsRateio(r) : null;
      const row = sheet.addRow({
        numero_nota: n.numero_nota || '—',
        fornecedor: lbl.fornecedor_label,
        cnpj: (forn && forn.cnpj) || '—',
        pagador: lbl.pagador_label,
        setor: n.setor || '—',
        data_emissao: toDate(n.data_emissao),
        vencimento: toDate(n.vencimento),
        competencia: toDate(n.competencia),
        valor_bruto: r ? (Number(r.valor) || 0) : (Number(n.valor_bruto) || 0),
        tem_retencao_imposto: n.tem_retencao_imposto ? 'Sim' : 'Não',
        valor_liquido: n.tem_retencao_imposto ? (Number(n.valor_liquido) || 0) : (Number(n.valor_bruto) || 0),
        forma_pagamento: n.forma_pagamento || '—',
        conta_bancaria: lbl.conta_bancaria_label || '—',
        classificacao: n.classificacao || '—',
        centro_custo: r ? rl.centro_label : (lbl.centro_custo_label || '—'),
        classe_conta: r ? rl.classe_label : (lbl.classe_conta_label || '—'),
        codigo_classificacao: r ? (rl.codigo_label || '—') : (lbl.codigo_classificacao_label || '—'),
        status: STATUS_LABEL[n.status] || n.status,
        pendente: n.pendente ? 'Sim' : 'Não',
        motivo_pendencia: n.motivo_pendencia || '—',
        solicitado_por: nomeUsuario(n.criado_por),
        aprovado_por: n.aprovado_por ? nomeUsuario(n.aprovado_por) : '—',
        data_aprovacao: toDate(n.data_aprovacao),
        numero_lancamento_group: n.numero_lancamento_group || '—',
        data_lancamento_group: toDate(n.data_lancamento_group),
        numero_chamado: n.numero_chamado || '—',
        data_chamado: toDate(n.data_chamado),
        data_validacao_csc: toDate(n.data_validacao_csc),
        validado_por: n.validado_por ? nomeUsuario(n.validado_por) : '—',
        data_pagamento: toDate(n.data_pagamento),
      });
      const statusCell = row.getCell('status');
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL_ARGB[n.status] || 'FFECEBE4' } };
      statusCell.font = { color: { argb: STATUS_FONT_ARGB[n.status] || 'FF5B6B63' }, bold: true };
      if (n.pendente) {
        const pendCell = row.getCell('pendente');
        pendCell.font = { color: { argb: 'FFB3431F' }, bold: true };
      }
    });
  });

  estilizarCabecalho(sheet);
  bordejarLinhas(sheet);
  return sheet;
}

// Retorna uma linha por alocação de custo — para nota sem rateio, sintetiza
// uma linha única com o centro/classe/código da própria nota e o valor
// bruto inteiro, assim a aba cobre 100% do valor das notas exportadas.
function linhasDeRateio(notas) {
  const linhas = [];
  notas.forEach(n => {
    const lbl = resolverLabelsNota(n);
    if (n.tem_rateio && n.rateios && n.rateios.length > 0) {
      n.rateios.forEach(r => {
        const rl = resolverLabelsRateio(r);
        linhas.push({
          numero_nota: n.numero_nota || '—', fornecedor: lbl.fornecedor_label, pagador: lbl.pagador_label,
          vencimento: toDate(n.vencimento), centro_custo: rl.centro_label, classe_conta: rl.classe_label,
          codigo_classificacao: rl.codigo_label || '—', valor: Number(r.valor) || 0, descricao: r.descricao || '—',
        });
      });
    } else {
      linhas.push({
        numero_nota: n.numero_nota || '—', fornecedor: lbl.fornecedor_label, pagador: lbl.pagador_label,
        vencimento: toDate(n.vencimento), centro_custo: lbl.centro_custo_label || '—', classe_conta: lbl.classe_conta_label || '—',
        codigo_classificacao: lbl.codigo_classificacao_label || '—', valor: Number(n.valor_bruto) || 0, descricao: n.descricao || '—',
      });
    }
  });
  return linhas;
}

function montarAbaRateio(workbook, linhas) {
  const sheet = workbook.addWorksheet('Rateio por Centro de Custo');
  sheet.columns = [
    { header: 'Nº NF', key: 'numero_nota', width: 14 },
    { header: 'Fornecedor', key: 'fornecedor', width: 30 },
    { header: 'Pagador', key: 'pagador', width: 16 },
    { header: 'Vencimento', key: 'vencimento', width: 13, style: { numFmt: DATE_FMT } },
    { header: 'Centro de custo', key: 'centro_custo', width: 26 },
    { header: 'Classe da conta', key: 'classe_conta', width: 24 },
    { header: 'Código classificação', key: 'codigo_classificacao', width: 24 },
    { header: 'Valor da linha', key: 'valor', width: 15, style: { numFmt: MONEY_FMT } },
    { header: 'Descrição', key: 'descricao', width: 30 },
  ];
  linhas.forEach(l => sheet.addRow(l));
  estilizarCabecalho(sheet);
  bordejarLinhas(sheet);
  return sheet;
}

// Uma linha por imposto retido -- só notas com tem_retencao_imposto entram
// aqui (diferente de linhasDeRateio, não sintetiza linha pra nota sem
// retenção, já que "zero impostos" não é um dado que faça sentido listar).
function linhasDeImposto(notas) {
  const linhas = [];
  notas.forEach(n => {
    if (!n.tem_retencao_imposto || !n.impostos || n.impostos.length === 0) return;
    const lbl = resolverLabelsNota(n);
    n.impostos.forEach(i => {
      linhas.push({
        numero_nota: n.numero_nota || '—', fornecedor: lbl.fornecedor_label, pagador: lbl.pagador_label,
        vencimento: toDate(n.vencimento), tipo: TIPO_IMPOSTO_LABEL[i.tipo] || i.tipo,
        valor: Number(i.valor) || 0, descricao: i.descricao || '—',
        valor_bruto: Number(n.valor_bruto) || 0, valor_liquido: Number(n.valor_liquido) || 0,
      });
    });
  });
  return linhas;
}

function montarAbaImpostos(workbook, linhas) {
  const sheet = workbook.addWorksheet('Impostos Retidos');
  sheet.columns = [
    { header: 'Nº NF', key: 'numero_nota', width: 14 },
    { header: 'Fornecedor', key: 'fornecedor', width: 30 },
    { header: 'Pagador', key: 'pagador', width: 16 },
    { header: 'Vencimento', key: 'vencimento', width: 13, style: { numFmt: DATE_FMT } },
    { header: 'Tipo de imposto', key: 'tipo', width: 18 },
    { header: 'Valor retido', key: 'valor', width: 15, style: { numFmt: MONEY_FMT } },
    { header: 'Descrição', key: 'descricao', width: 30 },
    { header: 'Valor bruto da nota', key: 'valor_bruto', width: 16, style: { numFmt: MONEY_FMT } },
    { header: 'Valor líquido da nota', key: 'valor_liquido', width: 16, style: { numFmt: MONEY_FMT } },
  ];
  linhas.forEach(l => sheet.addRow(l));
  estilizarCabecalho(sheet);
  bordejarLinhas(sheet);
  return sheet;
}

function montarAbaResumo(workbook, linhas) {
  const porCentro = new Map();
  linhas.forEach(l => {
    const atual = porCentro.get(l.centro_custo) || { total: 0, qtd: 0 };
    atual.total += l.valor;
    atual.qtd += 1;
    porCentro.set(l.centro_custo, atual);
  });
  const totalGeral = linhas.reduce((s, l) => s + l.valor, 0);
  const linhasResumo = Array.from(porCentro.entries())
    .map(([centro_custo, v]) => ({ centro_custo, qtd_lancamentos: v.qtd, total: v.total, participacao: totalGeral > 0 ? v.total / totalGeral : 0 }))
    .sort((a, b) => b.total - a.total);

  const sheet = workbook.addWorksheet('Resumo por Centro de Custo');
  sheet.columns = [
    { header: 'Centro de custo', key: 'centro_custo', width: 30 },
    { header: 'Qtd. lançamentos', key: 'qtd_lancamentos', width: 16 },
    { header: 'Total', key: 'total', width: 16, style: { numFmt: MONEY_FMT } },
    { header: '% do total exportado', key: 'participacao', width: 18, style: { numFmt: '0.0%' } },
  ];
  linhasResumo.forEach(l => sheet.addRow(l));
  const totalRow = sheet.addRow({ centro_custo: 'TOTAL GERAL', qtd_lancamentos: linhas.length, total: totalGeral, participacao: 1 });
  totalRow.eachCell(cell => { cell.font = { bold: true }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3EEEB' } }; });

  estilizarCabecalho(sheet);
  bordejarLinhas(sheet);
  return sheet;
}

// Modelo em branco pra importação de histórico (aba Cadastros → Importar,
// ver events_importar.js) — mesma estrutura de colunas da aba "Notas" da
// exportação normal (montarAbaNotas), só que sem nenhuma linha de dado.
export async function exportarModeloImportacao() {
  const ExcelJS = (await import('https://esm.sh/exceljs@4.4.0/dist/exceljs.min.js')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Central CP';
  workbook.created = new Date();
  montarAbaNotas(workbook, []);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'central-cp-modelo-importacao.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportarNotasExcel(notas) {
  const ExcelJS = (await import('https://esm.sh/exceljs@4.4.0/dist/exceljs.min.js')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Central CP';
  workbook.created = new Date();

  montarAbaNotas(workbook, notas);
  const linhasRateio = linhasDeRateio(notas);
  montarAbaRateio(workbook, linhasRateio);
  montarAbaImpostos(workbook, linhasDeImposto(notas));
  montarAbaResumo(workbook, linhasRateio);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const hoje = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `central-cp-notas-${hoje}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
