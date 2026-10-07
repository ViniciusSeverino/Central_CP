// src/js/fluxo_caixa.js
//
// Fluxo de caixa por pagador (Visão geral › Fluxo de caixa, ver
// ui_fluxo.js) -- lógica pura, sem DOM.
//
// Regras (decididas com o dono do produto):
// - Entradas = receitas do Group (receitas.js); saídas = despesas do Group
//   (group_importacao.js) -- o mesmo realizado oficial do DRE.
// - Meses passados: só o realizado (recebimento / pagamento baixados).
// - Mês atual e futuros: o realizado até hoje + o projetado:
//   - a receber: receitas em aberto pelo vencimento. Vencido há até 90
//     dias entra no mês atual (cobrável); vencido há mais de 90 dias fica
//     FORA (vai pro quadro de inadimplência);
//   - a pagar: despesas do Group ainda não baixadas pelo vencimento
//     (vencidas caem no mês atual), mais as notas do Central CP em
//     andamento que ainda não têm lançamento no Group (nº de movimento
//     inexistente no relatório) -- assim nada conta duas vezes.
// - Saldo: começa no saldo em conta informado (início de um mês) e é
//   encadeado mês a mês com a geração de caixa; antes dele, não há saldo.
import { grupoDaReceita, recebida, GRUPOS_RECEITA } from './receitas.js';

export const DIAS_COBRAVEL = 90;
const ABERTAS = new Set(['lancado', 'aprovado', 'lancado_no_group', 'chamado_aberto', 'validado_csc']);
const CHAVE_CP = 'cp_sem_group';
const ROTULO_CP = 'Notas do Central CP ainda sem lançamento no Group';

const mesDe = (v) => (v ? String(v).slice(0, 7) : null);
const isoMes = (ano, m) => `${ano}-${String(m).padStart(2, '0')}`;
const normNum = (v) => String(v == null ? '' : v).trim().replace(/^0+(?=\d)/, '');
const baixado = (l) => /baixad/i.test(l.situacao || '');
const diasEntre = (de, ate) => {
  const [a, m, d] = de.split('-').map(Number);
  return Math.floor((Date.UTC(ate.getFullYear(), ate.getMonth(), ate.getDate()) - Date.UTC(a, m - 1, d)) / 86400000);
};
export const proximoMes = (iso) => { const [a, m] = iso.split('-').map(Number); return m === 12 ? isoMes(a + 1, 1) : isoMes(a, m + 1); };

// Movimentos de caixa do pagador, cada um { mes, tipo: 'entrada'|'saida',
// chave, label, valor, projetado }. casar = criarCasador (pra nomear o
// centro de custo das despesas pelo plano do Central CP).
export function movimentosDeCaixa({ receitas = [], lancamentos = [], notas = [], casar = null, cadastros = {}, pagadorId, hoje = new Date() }) {
  const mesAtual = isoMes(hoje.getFullYear(), hoje.getMonth() + 1);
  const hojeIso = `${mesAtual}-${String(hoje.getDate()).padStart(2, '0')}`;
  const out = [];
  const rotGrupo = Object.fromEntries(GRUPOS_RECEITA.map(g => [g.chave, g.label]));
  for (const r of receitas) {
    if (pagadorId && r.pagador_id !== pagadorId) continue;
    const grupo = grupoDaReceita(r.classe);
    if (recebida(r)) {
      const mes = mesDe(r.recebimento);
      const valor = Number(r.valor_liquido) || 0;
      if (mes && valor) out.push({ mes, tipo: 'entrada', chave: grupo, label: rotGrupo[grupo], valor, projetado: false });
      continue;
    }
    const valor = Number(r.faturado) || 0;
    if (!r.vencimento || valor <= 0) continue;
    let mes = mesDe(r.vencimento);
    if (r.vencimento < hojeIso) {
      if (diasEntre(r.vencimento, hoje) > DIAS_COBRAVEL) continue; // inadimplência antiga: fora da projeção
      mes = mesAtual;
    }
    if (mes < mesAtual) mes = mesAtual;
    out.push({ mes, tipo: 'entrada', chave: grupo, label: rotGrupo[grupo], valor, projetado: true });
  }
  const centros = new Map((cadastros.centros_custo || []).map(c => [c.id, c]));
  const nomeCentro = (l) => {
    const r = casar ? casar(l) : null;
    const c = r && r.centroId ? centros.get(r.centroId) : null;
    return c ? { chave: c.id, label: `${c.codigo ? `${c.codigo} ` : ''}${c.nome}` } : { chave: `g:${l.centro_nome}`, label: l.centro_nome || 'Sem centro de custo' };
  };
  const movimentosGroup = new Set();
  for (const l of lancamentos) {
    if (pagadorId && l.pagador_id !== pagadorId) continue;
    if (l.movimento) movimentosGroup.add(normNum(l.movimento));
    const valor = Number(l.valor) || 0;
    if (!valor) continue;
    const { chave, label } = nomeCentro(l);
    if (baixado(l)) {
      const mes = mesDe(l.pagamento);
      if (mes) out.push({ mes, tipo: 'saida', chave, label, valor, projetado: false });
      continue;
    }
    let mes = mesDe(l.vencimento);
    if (!mes) continue;
    if (mes < mesAtual) mes = mesAtual;
    out.push({ mes, tipo: 'saida', chave, label, valor, projetado: true });
  }
  for (const n of notas) {
    if (pagadorId && n.pagador_id !== pagadorId) continue;
    if (!ABERTAS.has(n.status)) continue;
    const mov = normNum(n.numero_lancamento_group);
    if (mov && movimentosGroup.has(mov)) continue; // já está no Group
    const valor = Number(n.valor_bruto) || 0;
    let mes = mesDe(n.vencimento);
    if (!mes || !valor) continue;
    if (mes < mesAtual) mes = mesAtual;
    out.push({ mes, tipo: 'saida', chave: CHAVE_CP, label: ROTULO_CP, valor, projetado: true });
  }
  return out;
}

// Geração de caixa (entradas − saídas) de um mês 'AAAA-MM'.
const geracaoDoMes = (movs, mes) => movs.reduce((t, m) => (m.mes === mes ? t + (m.tipo === 'entrada' ? m.valor : -m.valor) : t), 0);

// O ano mês a mês. saldo = { data: 'AAAA-MM-DD' (início do mês), valor }.
export function fluxoDeCaixa(params) {
  const { ano, saldo = null, hoje = new Date() } = params;
  const movs = movimentosDeCaixa(params);
  const mesAtual = isoMes(hoje.getFullYear(), hoje.getMonth() + 1);
  const linhas = (tipo) => {
    const mapa = new Map();
    for (const m of movs) {
      if (m.tipo !== tipo || !m.mes.startsWith(`${ano}-`)) continue;
      if (!mapa.has(m.chave)) mapa.set(m.chave, { chave: m.chave, label: m.label, vals: Array(12).fill(0), proj: Array(12).fill(0) });
      const l = mapa.get(m.chave);
      const i = Number(m.mes.slice(5)) - 1;
      l.vals[i] += m.valor;
      if (m.projetado) l.proj[i] += m.valor;
    }
    const ordemRec = Object.fromEntries(GRUPOS_RECEITA.map((g, i) => [g.chave, i]));
    return Array.from(mapa.values()).map(l => ({ ...l, total: l.vals.reduce((a, b) => a + b, 0) }))
      .sort((a, b) => (tipo === 'entrada' ? (ordemRec[a.chave] ?? 99) - (ordemRec[b.chave] ?? 99) : (a.chave === CHAVE_CP) - (b.chave === CHAVE_CP) || b.total - a.total));
  };
  const entradas = linhas('entrada');
  const saidas = linhas('saida');
  const somaCol = (ls, i, campo = 'vals') => ls.reduce((t, l) => t + l[campo][i], 0);
  // Saldo no início do ano: o informado, encadeado até janeiro (pra trás
  // não há saldo -- se o informado é de depois de janeiro, os meses antes
  // ficam sem saldo).
  const mesSaldo = saldo && saldo.data ? mesDe(saldo.data) : null;
  // Primeiro mês com pagamento baixado nas despesas do Group do pagador: um
  // saldo de antes disso encadearia entradas sem as saídas (o Group só tem
  // pagamentos a partir de fev/2026).
  const primeiroMesDados = (params.lancamentos || [])
    .filter(l => (!params.pagadorId || l.pagador_id === params.pagadorId) && baixado(l) && l.pagamento)
    .reduce((m, l) => { const x = mesDe(l.pagamento); return !m || x < m ? x : m; }, null);
  let saldoCorrente = null;
  if (mesSaldo && mesSaldo <= isoMes(ano, 1)) {
    saldoCorrente = Number(saldo.valor) || 0;
    for (let m = mesSaldo; m < isoMes(ano, 1); m = proximoMes(m)) saldoCorrente += geracaoDoMes(movs, m);
  }
  const meses = [];
  for (let i = 0; i < 12; i++) {
    const iso = isoMes(ano, i + 1);
    if (mesSaldo && iso === mesSaldo && saldoCorrente === null) saldoCorrente = Number(saldo.valor) || 0;
    const entra = somaCol(entradas, i), sai = somaCol(saidas, i);
    const geracao = entra - sai;
    const saldoInicial = saldoCorrente;
    if (saldoCorrente !== null) saldoCorrente += geracao;
    meses.push({
      mes: i + 1, iso, projetado: iso >= mesAtual, atual: iso === mesAtual,
      entradas: entra, saidas: sai, geracao,
      entradasProj: somaCol(entradas, i, 'proj'), saidasProj: somaCol(saidas, i, 'proj'),
      saldoInicial, saldoFinal: saldoCorrente,
    });
  }
  // Saldo de hoje (estimado): início do mês atual + o que já foi realizado nele.
  const atual = meses.find(m => m.atual);
  const realizadoAtual = atual ? (atual.entradas - atual.entradasProj) - (atual.saidas - atual.saidasProj) : 0;
  const saldoHoje = atual && atual.saldoInicial !== null ? atual.saldoInicial + realizadoAtual : null;
  // Menor saldo final nos próximos 3 meses (a partir do atual).
  const proximos = meses.filter(m => m.iso >= mesAtual).slice(0, 3).filter(m => m.saldoFinal !== null);
  const menor = proximos.length ? proximos.reduce((a, b) => (b.saldoFinal < a.saldoFinal ? b : a)) : null;
  const total = (campo) => meses.reduce((t, m) => t + m[campo], 0);
  return {
    ano, meses, entradas, saidas, temSaldo: !!mesSaldo, saldoHoje, menorProximo: menor,
    primeiroMesDados, saldoAntesDosDados: !!(mesSaldo && primeiroMesDados && mesSaldo < primeiroMesDados),
    totalEntradas: total('entradas'), totalSaidas: total('saidas'), totalGeracao: total('geracao'),
    totalEntradasProj: total('entradasProj'), totalSaidasProj: total('saidasProj'),
  };
}

// Inadimplência detalhada: maiores devedores (sacado + loja) e parcelas
// de acordos / confissões a vencer por ano (Núm. Acordo preenchido). As faixas de atraso vêm de inadimplencia()
// (receitas.js).
export function devedoresEAcordos(receitas, { pagadorId, hoje = new Date(), limite = 10 } = {}) {
  const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  const devedores = new Map();
  const acordos = new Map();
  for (const r of receitas || []) {
    if (pagadorId && r.pagador_id !== pagadorId) continue;
    if (recebida(r) || !r.vencimento) continue;
    const valor = Number(r.faturado) || 0;
    if (valor <= 0) continue;
    if (r.vencimento < hojeIso) {
      const k = `${r.sacado || '—'}|${r.luc || ''}`;
      const d = devedores.get(k) || { sacado: r.sacado || '—', luc: r.luc || '', valor: 0, qtd: 0, maisAntigo: r.vencimento };
      d.valor += valor; d.qtd++;
      if (r.vencimento < d.maisAntigo) d.maisAntigo = r.vencimento;
      devedores.set(k, d);
    } else if (r.num_acordo || /CONFISS|ACORDO/.test(String(r.classe || ''))) {
      // Parcela de acordo (Núm. Acordo preenchido) ou confissão de dívida.
      const a = r.vencimento.slice(0, 4);
      const x = acordos.get(a) || { ano: Number(a), valor: 0, qtd: 0 };
      x.valor += valor; x.qtd++;
      acordos.set(a, x);
    }
  }
  return {
    devedores: Array.from(devedores.values()).sort((a, b) => b.valor - a.valor).slice(0, limite),
    acordos: Array.from(acordos.values()).sort((a, b) => a.ano - b.ano),
  };
}
