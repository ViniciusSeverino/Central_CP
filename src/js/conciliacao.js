// src/js/conciliacao.js
//
// Conciliação Group x Central CP (aba "Conciliação" da Visão geral, ver
// ui_conciliacao.js) -- lógica pura. A chave é o nº do movimento:
// Movimento no relatório do Group = numero_lancamento_group na nota do
// Central CP. Comparado por movimento E pagador, porque um mesmo
// movimento pode ter notas de pagadores diferentes (ex.: honorário
// contábil rateado entre Consórcio e FPP).
//
// Grupos:
// - diferente: está nos dois, valores não batem (bruto do CP x soma das
//   linhas do Group, que inclui as retenções);
// - so_cp: nota do CP com nº de movimento que não existe no Group
//   (digitação errada, lançamento estornado ou ainda não exportado);
// - so_group: lançamento do Group sem nota no CP (folha, guias de impostos,
//   lançamentos diretos -- muitos são esperados);
// - sem_numero: nota do CP ainda sem nº de lançamento no Group;
// - bate.

const FORA = new Set(['rascunho', 'rascunho_recebimento', 'recebido', 'cancelada']);
export const TOLERANCIA = 0.05;

export const GRUPOS_CONCILIACAO = [
  { chave: 'diferente', label: 'Valor diferente' },
  { chave: 'so_cp', label: 'Só no Central CP' },
  { chave: 'so_group', label: 'Só no Group' },
  { chave: 'sem_numero', label: 'Sem nº do Group' },
  { chave: 'bate', label: 'Bate' },
];

const mesDe = (d) => (d ? String(d).slice(0, 7) : '');
const normNum = (v) => String(v == null ? '' : v).trim().replace(/^0+(?=\d)/, '');

export function conciliar(lancamentos, notas) {
  const itens = new Map();
  const item = (movimento, pagadorId) => {
    const k = `${movimento}|${pagadorId}`;
    if (!itens.has(k)) itens.set(k, { chave: k, movimento, pagadorId, valorGroup: 0, valorCp: 0, lancs: [], notas: [], vencimento: '', fornecedores: new Set(), classes: new Set() });
    return itens.get(k);
  };
  for (const l of lancamentos || []) {
    const mov = normNum(l.movimento);
    if (!mov) continue;
    const it = item(mov, l.pagador_id);
    it.valorGroup += Number(l.valor) || 0;
    it.lancs.push(l.id_group);
    if (l.vencimento && (!it.vencimento || l.vencimento < it.vencimento)) it.vencimento = l.vencimento;
    if (l.fornecedor) it.fornecedores.add(l.fornecedor);
    if (l.classe_base) it.classes.add(l.classe_base);
  }
  const semNumero = [];
  for (const n of notas || []) {
    if (FORA.has(n.status)) continue;
    const mov = normNum(n.numero_lancamento_group);
    if (!mov) { semNumero.push({ chave: `n|${n.id}`, movimento: null, pagadorId: n.pagador_id, valorGroup: 0, valorCp: Number(n.valor_bruto) || 0, lancs: [], notas: [n.id], vencimento: n.vencimento || '', fornecedores: new Set(), classes: new Set(), grupo: 'sem_numero' }); continue; }
    const it = item(mov, n.pagador_id);
    it.valorCp += Number(n.valor_bruto) || 0;
    it.notas.push(n.id);
    if (!it.lancs.length && n.vencimento && (!it.vencimento || n.vencimento < it.vencimento)) it.vencimento = n.vencimento;
  }
  const lista = Array.from(itens.values()).map(it => {
    const temG = it.lancs.length > 0, temC = it.notas.length > 0;
    const grupo = temG && temC ? (Math.abs(it.valorGroup - it.valorCp) < TOLERANCIA ? 'bate' : 'diferente') : temC ? 'so_cp' : 'so_group';
    return { ...it, grupo };
  }).concat(semNumero).map(it => ({ ...it, diferenca: it.valorGroup - it.valorCp, mes: mesDe(it.vencimento), fornecedores: Array.from(it.fornecedores), classes: Array.from(it.classes) }));
  return lista;
}

// Recorte (pagador, mês AAAA-MM pelo vencimento) + resumo por grupo.
export function filtrarConciliacao(lista, { pagadorId = '', mes = '' } = {}) {
  const recorte = lista.filter(it => (!pagadorId || it.pagadorId === pagadorId) && (!mes || it.mes === mes));
  const resumo = Object.fromEntries(GRUPOS_CONCILIACAO.map(g => [g.chave, { qtd: 0, group: 0, cp: 0 }]));
  for (const it of recorte) { const r = resumo[it.grupo]; r.qtd++; r.group += it.valorGroup; r.cp += it.valorCp; }
  return { recorte, resumo };
}
