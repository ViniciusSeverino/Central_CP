// src/js/dre.js
//
// DRE (aba "Resultado" da Visão geral, ver ui_dre.js) -- só a lógica,
// pura, sem DOM: receitas do Group por grupo › classe e despesas na árvore
// Centro de custo › Classe › Código do ANO, mês a mês, realizado x orçado,
// e o resultado (receitas − despesas operacionais).
//
// Regras (decididas com o dono do produto):
// - Um DRE por PAGADOR (Condomínio, FPP, Consórcio): cada um presta contas
//   em separado e tem seu próprio plano de contas.
// - Regime: "competencia" (emissão da nota no Central CP; Mes Ref no
//   Group) ou "caixa" (data de pagamento/recebimento -- só o que já foi
//   pago/baixado).
// - Valor: o BRUTO da nota (é o custo; o imposto retido também é custo).
// - Rateio: o bruto é distribuído pela proporção de cada linha do rateio
//   -- funciona tanto pras notas em que o rateio soma o líquido (regra
//   atual, migration 0049) quanto pras antigas em que soma o bruto.
// - Fora do DRE: rascunhos, recebidos ainda não lançados e canceladas.
// - Centros que não são despesa operacional (distribuição de resultados,
//   valores a recuperar, não operacionais) ficam num bloco à parte, abaixo
//   do total operacional -- identificados pelo nome (ver grupoDoCentro).

import { GRUPOS_RECEITA, grupoDaReceita, classeDaReceita } from './receitas.js';

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
// "MM/AAAA" (Mes Ref do Group) -> 'AAAA-MM'.
const mesDoMesRef = (v) => { const m = /^(\d{2})\/(\d{4})$/.exec(String(v || '').trim()); return m ? `${m[2]}-${m[1]}` : null; };

export function mesAnteriorDe(mesIso, meses = 1) {
  const [ano, mes] = mesIso.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1 - meses, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Uma linha por (nota × item de classificação) já com o valor que cabe a
// ela -- a base de tudo o mais. Regime: competencia (emissão da nota; sem
// emissão, o campo competência) | caixa (data de pagamento).
export function linhasDespesa(notas, { pagadorId, regime = 'competencia' }) {
  const linhas = [];
  for (const n of notas || []) {
    if (FORA_DO_DRE.has(n.status)) continue;
    if (pagadorId && n.pagador_id !== pagadorId) continue;
    const mes = mesDe(regime === 'caixa' ? n.data_pagamento : (n.data_emissao || n.competencia));
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

// Despesas do Group (ver group_importacao.js) no mesmo formato: na
// competência, o Mes Ref do Group (decisão do dono do produto -- o Group
// não traz a emissão); no caixa, a data de pagamento, e só o que já foi
// baixado. Retenções (linhas com sufixo de
// imposto) caem na mesma conta da linha principal -- somadas dão o bruto.
// Lançamento sem conta no Central CP (sem de-para) leva os nomes do Group,
// pra aparecer no DRE mesmo assim.
export function linhasGroup(lancamentos, casar, { pagadorId, regime = 'competencia' }) {
  const linhas = [];
  for (const l of lancamentos || []) {
    if (pagadorId && l.pagador_id !== pagadorId) continue;
    const caixa = regime === 'caixa';
    if (caixa && !/baixad/i.test(l.situacao || '')) continue;
    const mes = caixa ? mesDe(l.pagamento) : (mesDoMesRef(l.mes_ref) || mesDe(l.vencimento));
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
export function dreAnual(linhas, orcamento, cadastros, { ano, pagadorId, ateMes = 12, linhasGrp = null, linhasRec = null }) {
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
  const operacional = grupos[0];
  const receitas = receitasDoAno(linhasRec, orcamento, { ano, pagadorId, ateMes });
  // Resultado = receitas − despesas operacionais (o que está fora do
  // operacional -- distribuição, a recuperar -- não é custo da operação).
  const resultado = { real: zeros(), grp: zeros(), orc: zeros(), rea: zeros() };
  for (let i = 0; i < 12; i++) {
    resultado.rea[i] = receitas.total.rea[i] - operacional.rea[i];
    resultado.orc[i] = receitas.total.orc[i] - operacional.orc[i];
  }
  Object.assign(resultado, { totalRea: somaAte(resultado.rea), totalOrc: somaAte(resultado.orc), ytdRea: somaAte(resultado.rea, ateMes), ytdOrc: somaAte(resultado.orc, ateMes) });
  return { ano, ateMes, fonte, grupos, operacional, total: somaNos(grupos), receitas, resultado, temReceitas: receitas.grupos.length > 0 };
}

// Receitas do ano: grupo (Aluguéis, Encargos...) › classe do Group, cada nó
// com o realizado (Group -- não há receita no Central CP) e o orçado por
// classe (orcamento.receita_classe). Mesmo formato de nó das despesas, com
// real (CP) zerado e semCp marcado.
function receitasDoAno(linhasRec, orcamento, { ano, pagadorId, ateMes }) {
  const grupos = new Map();
  const no = (classe) => {
    const g = grupoDaReceita(classe);
    if (!grupos.has(g)) grupos.set(g, { chave: g, filhos: new Map() });
    const ng = grupos.get(g);
    if (!ng.filhos.has(classe)) ng.filhos.set(classe, { id: null, codigo: '', nome: classe, rea: zeros(), orc: zeros() });
    return ng.filhos.get(classe);
  };
  const prefixo = `${ano}-`;
  for (const l of linhasRec || []) {
    if (!l.mes.startsWith(prefixo)) continue;
    no(l.classe).rea[Number(l.mes.slice(5)) - 1] += l.valor;
  }
  for (const o of orcamento || []) {
    if (!o.receita_classe || o.ano !== ano || (pagadorId && o.pagador_id !== pagadorId)) continue;
    no(classeDaReceita(o.receita_classe)).orc[o.mes - 1] += Number(o.valor) || 0;
  }
  const fecharNo = (n) => ({ ...n, real: zeros(), grp: n.rea, semCp: true, receita: true,
    totalRea: somaAte(n.rea), totalOrc: somaAte(n.orc), totalReal: 0, totalGrp: somaAte(n.rea),
    ytdRea: somaAte(n.rea, ateMes), ytdOrc: somaAte(n.orc, ateMes), ytdReal: 0, ytdGrp: somaAte(n.rea, ateMes) });
  const somar = (lista) => {
    const rea = zeros(), orc = zeros();
    lista.forEach(x => { for (let i = 0; i < 12; i++) { rea[i] += x.rea[i]; orc[i] += x.orc[i]; } });
    return fecharNo({ rea, orc });
  };
  const lista = GRUPOS_RECEITA.filter(g => grupos.has(g.chave)).map(g => {
    const filhos = Array.from(grupos.get(g.chave).filhos.values()).map(fecharNo)
      .sort((a, b) => b.totalRea - a.totalRea || a.nome.localeCompare(b.nome, 'pt-BR'));
    return { ...somar(filhos), id: null, chave: g.chave, codigo: '', nome: g.label, filhos };
  });
  return { grupos: lista, total: somar(lista) };
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

// Pagadores que aparecem no DRE, na ordem do dono do produto: Consórcio,
// Condomínio, FPP (o primeiro é o padrão); outros depois, por nome.
const ORDEM_PAGADORES = ['CONS', 'COND', 'FPP'];
export function pagadoresDoDre(cadastros) {
  const pos = (p) => { const i = ORDEM_PAGADORES.indexOf(p.sigla); return i < 0 ? ORDEM_PAGADORES.length : i; };
  return (cadastros.pagadores || []).slice().sort((a, b) => pos(a) - pos(b) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
}
