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
const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const normNum = (v) => String(v == null ? '' : v).trim().replace(/^0+(?=\d)/, '');

// Fornecedor da linha principal (a maior que não é retenção) primeiro: as
// linhas de INSS/ISS trazem o órgão (ex.: "Ministerio da Prev.") como
// fornecedor, o que esconderia quem prestou o serviço.
// Mesma ideia pra descrição ("M.O. LIMPEZA AGO/26" antes de "INSS 11%").
function principalPrimeiro(it, campo = 'fornecedor', conjunto = it.fornecedores) {
  const principal = (it.lancs || []).filter(l => !l.eh_retencao && l[campo]).sort((a, b) => b.valor - a.valor)[0];
  const todos = Array.from(conjunto);
  return principal ? [principal[campo], ...todos.filter(f => f !== principal[campo])] : todos;
}

export function conciliar(lancamentos, notas) {
  const itens = new Map();
  const item = (movimento, pagadorId) => {
    const k = `${movimento}|${pagadorId}`;
    if (!itens.has(k)) itens.set(k, { chave: k, movimento, pagadorId, valorGroup: 0, valorCp: 0, lancs: [], notas: [], vencimento: '', pagamento: '', fornecedores: new Set(), classes: new Set(), descricoes: new Set(), nfs: new Set(), situacoes: new Set() });
    return itens.get(k);
  };
  for (const l of lancamentos || []) {
    const mov = normNum(l.movimento);
    if (!mov) continue;
    const it = item(mov, l.pagador_id);
    it.valorGroup += Number(l.valor) || 0;
    it.lancs.push(l);
    if (l.vencimento && (!it.vencimento || l.vencimento < it.vencimento)) it.vencimento = l.vencimento;
    if (l.pagamento && l.pagamento > it.pagamento) it.pagamento = l.pagamento;
    if (l.fornecedor) it.fornecedores.add(l.fornecedor);
    if (l.favorecido && l.favorecido !== l.fornecedor) it.fornecedores.add(l.favorecido);
    if (l.classe_base) it.classes.add(l.classe_base);
    if (l.descricao) it.descricoes.add(l.descricao);
    if (l.nota_fiscal) it.nfs.add(normNum(l.nota_fiscal));
    if (l.situacao) it.situacoes.add(l.situacao);
  }
  const semNumero = [];
  for (const n of notas || []) {
    if (FORA.has(n.status)) continue;
    const mov = normNum(n.numero_lancamento_group);
    if (!mov) { semNumero.push({ chave: `n|${n.id}`, movimento: null, pagadorId: n.pagador_id, valorGroup: 0, valorCp: Number(n.valor_bruto) || 0, lancs: [], notas: [n.id], vencimento: n.vencimento || '', pagamento: '', fornecedores: new Set(), classes: new Set(), descricoes: new Set(), nfs: new Set(), situacoes: new Set(), grupo: 'sem_numero' }); continue; }
    const it = item(mov, n.pagador_id);
    it.valorCp += Number(n.valor_bruto) || 0;
    it.notas.push(n.id);
    if (!it.lancs.length && n.vencimento && (!it.vencimento || n.vencimento < it.vencimento)) it.vencimento = n.vencimento;
  }
  const lista = Array.from(itens.values()).map(it => {
    const temG = it.lancs.length > 0, temC = it.notas.length > 0;
    const grupo = temG && temC ? (Math.abs(it.valorGroup - it.valorCp) < TOLERANCIA ? 'bate' : 'diferente') : temC ? 'so_cp' : 'so_group';
    return { ...it, grupo };
  }).concat(semNumero).map(it => ({ ...it, diferenca: it.valorGroup - it.valorCp, mes: mesDe(it.vencimento), fornecedores: principalPrimeiro(it), classes: Array.from(it.classes), descricoes: principalPrimeiro(it, 'descricao', it.descricoes), nfs: Array.from(it.nfs), situacoes: Array.from(it.situacoes) }));
  return lista;
}

// Texto pesquisável de um item: movimento, NFs (Group e CP), fornecedor /
// favorecido, descrição e classe do Group; das notas do CP, o fornecedor
// (nomeFornecedor = id -> nome, opcional) e a descrição.
function textoBusca(it, notasPorId, nomeFornecedor) {
  const partes = [it.movimento, ...it.nfs, ...it.fornecedores, ...it.descricoes, ...it.classes];
  for (const id of it.notas) {
    const n = notasPorId.get(id);
    if (n) partes.push(n.numero_nota, n.descricao, nomeFornecedor ? nomeFornecedor(n.fornecedor_id) : '');
  }
  return norm(partes.filter(Boolean).join(' | '));
}

// Recorte (pagador, mês AAAA-MM pelo vencimento, busca) + resumo por grupo.
// A busca aceita várias palavras (todas precisam aparecer).
export function filtrarConciliacao(lista, { pagadorId = '', mes = '', busca = '' } = {}, { notas = [], nomeFornecedor = null } = {}) {
  const termos = norm(busca).split(/\s+/).filter(Boolean);
  const notasPorId = termos.length ? new Map(notas.map(n => [n.id, n])) : null;
  const recorte = lista.filter(it => (!pagadorId || it.pagadorId === pagadorId) && (!mes || it.mes === mes)
    && (!termos.length || (t => termos.every(w => t.includes(w)))(textoBusca(it, notasPorId, nomeFornecedor))));
  const resumo = Object.fromEntries(GRUPOS_CONCILIACAO.map(g => [g.chave, { qtd: 0, group: 0, cp: 0 }]));
  for (const it of recorte) { const r = resumo[it.grupo]; r.qtd++; r.group += it.valorGroup; r.cp += it.valorCp; }
  return { recorte, resumo };
}
