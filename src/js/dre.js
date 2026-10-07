// src/js/dre.js
//
// DRE de despesas (aba "Resultado" da Visão geral, ver ui_dre.js) -- só a
// lógica, pura, sem DOM: a partir das notas, do orçamento e do plano de
// contas monta a árvore Centro de custo › Classe › Código do ANO, mês a
// mês, realizado x orçado.
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
// ela -- a base de tudo o mais. Regime: competencia | vencimento | caixa.
export function linhasDespesa(notas, { pagadorId, regime = 'competencia' }) {
  const linhas = [];
  for (const n of notas || []) {
    if (FORA_DO_DRE.has(n.status)) continue;
    if (pagadorId && n.pagador_id !== pagadorId) continue;
    const mes = mesDe(regime === 'caixa' ? n.data_pagamento : regime === 'vencimento' ? n.vencimento : n.competencia);
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

// Despesas do Group (ver group_importacao.js) no mesmo formato: o mês é o
// do VENCIMENTO (decisão do dono do produto); no regime de caixa, o da data
// de pagamento, e só o que já foi baixado. Retenções (linhas com sufixo de
// imposto) caem na mesma conta da linha principal -- somadas dão o bruto.
// Lançamento sem conta no Central CP (sem de-para) leva os nomes do Group,
// pra aparecer no DRE mesmo assim.
export function linhasGroup(lancamentos, casar, { pagadorId, regime = 'vencimento' }) {
  const linhas = [];
  for (const l of lancamentos || []) {
    if (pagadorId && l.pagador_id !== pagadorId) continue;
    const caixa = regime === 'caixa';
    if (caixa && !/baixad/i.test(l.situacao || '')) continue;
    const mes = mesDe(caixa ? l.pagamento : l.vencimento);
    if (!mes) continue;
    const r = casar(l) || {};
    linhas.push({
      lancId: l.id_group, movimento: l.movimento, mes, valor: Number(l.valor) || 0,
      centroId: r.centroId || null, classeId: r.classeId || null, codigoId: r.codigoId || null,
      centroGroup: l.centro_nome, classeGroup: l.classe_base, casado: !!(r.codigoId || r.classeId),
    });
  }
  return linhas;
}

const dentro = (m, de, ate) => m >= de && m <= ate;
const zeros = () => Array(12).fill(0);
const somaAte = (arr, ateMes = 12) => arr.slice(0, ateMes).reduce((s, v) => s + v, 0);

function porId(lista) {
  const out = new Map();
  (lista || []).forEach(x => out.set(x.id, x));
  return out;
}

const SEM = (tipo) => ({ id: null, codigo: '', nome: `Sem ${tipo}` });

// DRE do ANO: árvore grupos › centros › classes › códigos, cada nó com o
// realizado e o orçado mês a mês (arrays de 12) e os totais. O orçamento
// pode estar no nível do código ou da classe inteira (ver migration 0055):
// orçado de classe soma no nó da classe e do centro, não nos códigos.
// ateMes (1-12): até onde vai o "acumulado até hoje" usado nos desvios --
// comparar o ano inteiro orçado com um realizado ainda pela metade não diz
// nada.
export function dreAnual(linhas, orcamento, cadastros, { ano, pagadorId, ateMes = 12, linhasGrp = null }) {
  // Com as despesas do Group importadas, o realizado oficial (rea) é o
  // Group e o Central CP (real) vira conferência; sem elas, rea = CP.
  const fonte = linhasGrp && linhasGrp.length ? 'group' : 'cp';
  const centros = porId(cadastros.centros_custo);
  const classes = porId(cadastros.classes_conta);
  const codigos = porId(cadastros.codigos_classificacao);
  const arvore = new Map();
  const no = (mapa, chave, base) => {
    if (!mapa.has(chave)) mapa.set(chave, { ...base, real: zeros(), grp: zeros(), orc: zeros(), filhos: new Map(), notas: new Set() });
    return mapa.get(chave);
  };
  const ramo = (centroId, classeId, codigoId) => {
    const c = centros.get(centroId) || SEM('centro de custo');
    const nC = no(arvore, centroId || '_', { id: centroId, codigo: c.codigo, nome: c.nome, grupo: grupoDoCentro(c) });
    if (classeId === undefined) return [nC];
    const cl = classes.get(classeId) || SEM('classe');
    const nCl = no(nC.filhos, classeId || '_', { id: classeId, codigo: cl.codigo, nome: cl.nome });
    if (codigoId === undefined) return [nC, nCl];
    const co = codigos.get(codigoId) || SEM('código');
    return [nC, nCl, no(nCl.filhos, codigoId || '_', { id: codigoId, codigo: co.codigo, nome: co.nome })];
  };
  const prefixo = `${ano}-`;
  for (const l of linhas) {
    if (!l.mes.startsWith(prefixo)) continue;
    const m = Number(l.mes.slice(5)) - 1;
    for (const n of ramo(l.centroId, l.classeId, l.codigoId)) { n.real[m] += l.valor; n.notas.add(l.notaId); }
  }
  // Group: conta casada -> mesmo ramo do CP; casada só até a classe -> nó
  // da classe; sem conta no CP -> ramo com os nomes do próprio Group.
  for (const l of linhasGrp || []) {
    if (!l.mes.startsWith(prefixo)) continue;
    const m = Number(l.mes.slice(5)) - 1;
    let nos;
    if (l.codigoId) nos = ramo(l.centroId, l.classeId, l.codigoId);
    else if (l.classeId) nos = ramo(l.centroId, l.classeId);
    else {
      const c = l.centroId ? centros.get(l.centroId) : null;
      const nC = c ? ramo(l.centroId)[0] : no(arvore, `g:${l.centroGroup}`, { id: null, codigo: '', nome: `${l.centroGroup} (Group, sem conta no Central CP)`, grupo: grupoDoCentro({ nome: l.centroGroup }), soGroup: true });
      nos = [nC, no(nC.filhos, `g:${l.classeGroup}`, { id: null, codigo: '', nome: `${l.classeGroup} (Group, sem de-para)`, soGroup: true })];
    }
    for (const n of nos) n.grp[m] += l.valor;
  }
  for (const o of orcamento || []) {
    if (o.ano !== ano || (pagadorId && o.pagador_id !== pagadorId)) continue;
    const m = o.mes - 1;
    const valor = Number(o.valor) || 0;
    if (o.codigo_classificacao_id) {
      const co = codigos.get(o.codigo_classificacao_id);
      const cl = co && classes.get(co.classe_conta_id);
      if (!cl) continue;
      for (const n of ramo(cl.centro_custo_id, cl.id, co.id)) n.orc[m] += valor;
    } else if (o.classe_conta_id) {
      const cl = classes.get(o.classe_conta_id);
      if (!cl) continue;
      const nos = ramo(cl.centro_custo_id, cl.id);
      for (const n of nos) n.orc[m] += valor;
      nos[1].orcNaClasse = true;
    }
  }
  const totais = (n) => {
    const rea = fonte === 'group' ? n.grp : n.real;
    return { rea, totalReal: somaAte(n.real), totalGrp: somaAte(n.grp), totalOrc: somaAte(n.orc), totalRea: somaAte(rea),
      ytdReal: somaAte(n.real, ateMes), ytdGrp: somaAte(n.grp, ateMes), ytdOrc: somaAte(n.orc, ateMes), ytdRea: somaAte(rea, ateMes) };
  };
  const fechar = (mapa) => Array.from(mapa.values())
    .map(n => ({ ...n, qtdNotas: n.notas.size, notas: undefined, ...totais(n), filhos: fechar(n.filhos) }))
    .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true }) || String(a.nome).localeCompare(String(b.nome)));
  const todos = fechar(arvore);
  const somaNos = (lista) => {
    const n = { real: zeros(), grp: zeros(), orc: zeros() };
    lista.forEach(x => x.real.forEach((v, i) => { n.real[i] += v; n.grp[i] += x.grp[i]; n.orc[i] += x.orc[i]; }));
    return { ...n, ...totais(n) };
  };
  const grupos = GRUPOS_DRE.map(g => {
    const doGrupo = todos.filter(c => c.grupo === g.chave);
    return { ...g, centros: doGrupo, ...somaNos(doGrupo) };
  }).filter(g => g.chave === 'operacional' || g.centros.length);
  return { ano, ateMes, fonte, grupos, operacional: grupos[0], total: somaNos(grupos) };
}

// Contas mais acima do orçado no acumulado até ateMes -- no nível em que o
// orçamento foi feito (código, ou a classe quando o orçado é da classe).
export function maioresEstouros(dre, limite = 5) {
  const contas = [];
  const visitar = (n, nivel) => {
    if (nivel === 2 && n.orcNaClasse) { contas.push(n); return; }
    if (nivel === 3) { contas.push(n); return; }
    (n.filhos || []).forEach(f => visitar(f, nivel + 1));
  };
  dre.operacional.centros.forEach(c => visitar(c, 1));
  return contas
    .filter(n => n.ytdOrc > 0 && n.ytdRea > n.ytdOrc)
    .map(n => ({ id: n.id, codigo: n.codigo, nome: n.nome, desvio: n.ytdRea - n.ytdOrc, pct: (n.ytdRea - n.ytdOrc) / n.ytdOrc }))
    .sort((a, b) => b.desvio - a.desvio)
    .slice(0, limite);
}

// Notas que compõem um código num mês (1-12) ou no ano todo (mes null),
// maior valor primeiro. codigoId null = linhas sem código.
export function notasDoCodigo(linhas, codigoId, { ano, mes = null }) {
  const de = mes ? `${ano}-${String(mes).padStart(2, '0')}` : `${ano}-01`;
  const ate = mes ? de : `${ano}-12`;
  const porNota = new Map();
  for (const l of linhas) {
    if ((l.codigoId || null) !== (codigoId || null) || !dentro(l.mes, de, ate)) continue;
    porNota.set(l.notaId, (porNota.get(l.notaId) || 0) + l.valor);
  }
  return Array.from(porNota, ([notaId, valor]) => ({ notaId, valor })).sort((a, b) => b.valor - a.valor);
}

// Lançamentos do Group que compõem um código num mês (ou no ano).
export function lancamentosDoCodigo(linhasGrp, codigoId, { ano, mes = null }) {
  const de = mes ? `${ano}-${String(mes).padStart(2, '0')}` : `${ano}-01`;
  const ate = mes ? de : `${ano}-12`;
  return (linhasGrp || [])
    .filter(l => (l.codigoId || null) === (codigoId || null) && dentro(l.mes, de, ate))
    .sort((a, b) => b.valor - a.valor);
}

// Pagadores que aparecem no DRE (os do cadastro, na ordem dele).
export function pagadoresDoDre(cadastros) {
  return (cadastros.pagadores || []).slice();
}
