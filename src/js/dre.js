// src/js/dre.js
//
// DRE de despesas (aba "Resultado" da Visão geral, ver ui_dre.js) -- só a
// lógica, pura, sem DOM: a partir das notas e do plano de contas monta a
// árvore Centro de custo › Classe › Código do período escolhido.
//
// Regras (decididas com o dono do produto):
// - Um DRE por PAGADOR (Condomínio, FPP, Consórcio): cada um presta contas
//   em separado e tem seu próprio plano de contas.
// - Regime: "competencia" (campo competencia da nota, o do DRE contábil)
//   ou "caixa" (data_pagamento -- só entra o que já foi pago).
// - Valor: o BRUTO da nota (é o custo; o imposto retido também é custo).
// - Rateio: o bruto é distribuído pela proporção de cada linha do rateio
//   -- funciona tanto pras notas em que o rateio soma o líquido (regra
//   atual, migration 0049) quanto pras antigas em que soma o bruto.
// - Fora do DRE: rascunhos, recebidos ainda não lançados e canceladas.
// - Centros que não são despesa operacional (distribuição de resultados,
//   valores a recuperar, não operacionais) ficam num bloco à parte, abaixo
//   do total operacional -- identificados pelo nome (ver grupoDoCentro).

const FORA_DO_DRE = new Set(['rascunho', 'rascunho_recebimento', 'recebido', 'cancelada']);

export const GRUPOS_DRE = [
  { chave: 'operacional', label: 'Despesas operacionais' },
  { chave: 'nao_operacional', label: 'Não operacionais' },
  { chave: 'a_recuperar', label: 'Valores a recuperar' },
  { chave: 'distribuicao', label: 'Distribuição de resultados' },
];

export function grupoDoCentro(centro) {
  if (centro && centro.grupo_dre) return centro.grupo_dre;
  const nome = String((centro && centro.nome) || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  if (nome.includes('DISTRIBUICAO DE RESULTADO')) return 'distribuicao';
  if (nome.includes('A RECUPERAR')) return 'a_recuperar';
  if (nome.includes('NAO OPERACIONA')) return 'nao_operacional';
  return 'operacional';
}

// 'AAAA-MM' de uma data/competência ('AAAA-MM-DD...'), ou null.
const mesDe = (v) => (v ? String(v).slice(0, 7) : null);

export function mesAnteriorDe(mesIso, meses = 1) {
  const [ano, mes] = mesIso.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1 - meses, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Uma linha por (nota × item de classificação) já com o valor que cabe a
// ela -- a base de tudo o mais.
export function linhasDespesa(notas, { pagadorId, regime = 'competencia' }) {
  const linhas = [];
  for (const n of notas || []) {
    if (FORA_DO_DRE.has(n.status)) continue;
    if (pagadorId && n.pagador_id !== pagadorId) continue;
    const mes = mesDe(regime === 'caixa' ? n.data_pagamento : n.competencia);
    if (!mes) continue;
    const bruto = Number(n.valor_bruto) || 0;
    const rateios = n.tem_rateio ? (n.rateios || []) : [];
    const soma = rateios.reduce((s, r) => s + (Number(r.valor) || 0), 0);
    if (rateios.length && soma > 0) {
      for (const r of rateios) {
        linhas.push({ notaId: n.id, mes, valor: bruto * (Number(r.valor) || 0) / soma, centroId: r.centro_custo_id || null, classeId: r.classe_conta_id || null, codigoId: r.codigo_classificacao_id || null });
      }
    } else {
      linhas.push({ notaId: n.id, mes, valor: bruto, centroId: n.centro_custo_id || null, classeId: n.classe_conta_id || null, codigoId: n.codigo_classificacao_id || null });
    }
  }
  return linhas;
}

// Período: o mês, ou de janeiro até o mês (acumulado no ano). O período
// de comparação é o mês anterior, ou o mesmo acumulado do ano anterior.
export function periodo(mes, acumulado) {
  if (!acumulado) return { de: mes, ate: mes, antDe: mesAnteriorDe(mes), antAte: mesAnteriorDe(mes) };
  const ano = Number(mes.slice(0, 4));
  return { de: `${ano}-01`, ate: mes, antDe: `${ano - 1}-01`, antAte: `${ano - 1}${mes.slice(4)}` };
}
const dentro = (m, de, ate) => m >= de && m <= ate;

function porCodigo(lista) {
  const out = new Map();
  (lista || []).forEach(x => out.set(x.id, x));
  return out;
}

const SEM = (tipo) => ({ id: null, codigo: '', nome: `Sem ${tipo}` });

// Árvore do período: grupos › centros › classes › códigos, cada nível com
// realizado (período) e anterior (período de comparação), ordenados pelo
// código do plano de contas.
export function dreDoPeriodo(linhas, cadastros, { mes, acumulado = false }) {
  const p = periodo(mes, acumulado);
  const centros = porCodigo(cadastros.centros_custo);
  const classes = porCodigo(cadastros.classes_conta);
  const codigos = porCodigo(cadastros.codigos_classificacao);
  const arvore = new Map(); // centroId -> nó
  const no = (mapa, chave, base) => {
    if (!mapa.has(chave)) mapa.set(chave, { ...base, realizado: 0, anterior: 0, filhos: new Map(), notas: new Set() });
    return mapa.get(chave);
  };
  for (const l of linhas) {
    const atual = dentro(l.mes, p.de, p.ate);
    const ant = dentro(l.mes, p.antDe, p.antAte);
    if (!atual && !ant) continue;
    const c = centros.get(l.centroId) || SEM('centro de custo');
    const cl = classes.get(l.classeId) || SEM('classe');
    const co = codigos.get(l.codigoId) || SEM('código');
    const nC = no(arvore, l.centroId || '_', { id: l.centroId, codigo: c.codigo, nome: c.nome, grupo: grupoDoCentro(c) });
    const nCl = no(nC.filhos, l.classeId || '_', { id: l.classeId, codigo: cl.codigo, nome: cl.nome });
    const nCo = no(nCl.filhos, l.codigoId || '_', { id: l.codigoId, codigo: co.codigo, nome: co.nome });
    for (const n of [nC, nCl, nCo]) {
      if (atual) { n.realizado += l.valor; n.notas.add(l.notaId); }
      if (ant) n.anterior += l.valor;
    }
  }
  const ordenar = (mapa) => Array.from(mapa.values())
    .map(n => ({ ...n, qtdNotas: n.notas.size, notas: undefined, filhos: ordenar(n.filhos) }))
    .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true }) || String(a.nome).localeCompare(String(b.nome)));
  const todos = ordenar(arvore);
  const grupos = GRUPOS_DRE.map(g => {
    const doGrupo = todos.filter(c => c.grupo === g.chave);
    return { ...g, centros: doGrupo, realizado: soma(doGrupo, 'realizado'), anterior: soma(doGrupo, 'anterior') };
  }).filter(g => g.chave === 'operacional' || g.centros.length);
  return {
    periodo: p,
    grupos,
    operacional: grupos[0],
    total: { realizado: soma(grupos, 'realizado'), anterior: soma(grupos, 'anterior') },
  };
}
function soma(lista, campo) { return lista.reduce((s, x) => s + x[campo], 0); }

// Despesas operacionais dos 12 meses terminando em `mes` (gráfico).
export function serie12Meses(linhas, cadastros, mes) {
  const centros = porCodigo(cadastros.centros_custo);
  const meses = Array.from({ length: 12 }, (_, i) => mesAnteriorDe(mes, 11 - i));
  const totais = new Map(meses.map(m => [m, 0]));
  for (const l of linhas) {
    if (!totais.has(l.mes)) continue;
    if (grupoDoCentro(centros.get(l.centroId)) !== 'operacional') continue;
    totais.set(l.mes, totais.get(l.mes) + l.valor);
  }
  return meses.map(m => ({ mes: m, valor: totais.get(m) }));
}

// Notas que compõem um código no período (detalhamento), maior valor
// primeiro. codigoId null = linhas sem código.
export function notasDoCodigo(linhas, codigoId, { de, ate }) {
  const porNota = new Map();
  for (const l of linhas) {
    if ((l.codigoId || null) !== (codigoId || null) || !dentro(l.mes, de, ate)) continue;
    porNota.set(l.notaId, (porNota.get(l.notaId) || 0) + l.valor);
  }
  return Array.from(porNota, ([notaId, valor]) => ({ notaId, valor })).sort((a, b) => b.valor - a.valor);
}

// Pagadores que aparecem no DRE (os do cadastro, na ordem dele).
export function pagadoresDoDre(cadastros) {
  return (cadastros.pagadores || []).slice();
}
