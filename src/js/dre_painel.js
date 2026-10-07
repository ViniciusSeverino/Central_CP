// src/js/dre_painel.js
//
// Painel estratégico do DRE (ver ui_dre.js) -- lógica pura, sem DOM: o
// "mês em foco" (valor x orçado x mês anterior x mesmo mês do ano
// anterior), as contas que mais mudaram e a leitura automática em frases
// curtas. Tudo a partir do resultado de dreAnual (dre.js).

const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const nomeMes = (m) => MESES_LONGOS[m - 1] || '';

const variacao = (atual, base) => (base ? (atual - base) / Math.abs(base) : null);

// As três linhas do painel (receita, despesa operacional, resultado) num
// mês (1-12): valor, orçado e as bases de comparação. dreAnt = dreAnual do
// ano anterior (pode ser null).
export function comparativoMes(dre, dreAnt, mes) {
  const linha = (atual, anterior) => {
    if (!atual) return null;
    const valor = atual.rea[mes - 1];
    const orc = atual.orc[mes - 1];
    const mesAnt = mes > 1 ? atual.rea[mes - 2] : (anterior ? anterior.rea[11] : null);
    const anoAnt = anterior ? anterior.rea[mes - 1] : null;
    return {
      valor, orc,
      vsOrc: orc ? valor - orc : null, vsOrcPct: variacao(valor, orc),
      mesAnt, vsMesAnt: mesAnt ? valor - mesAnt : null, vsMesAntPct: variacao(valor, mesAnt),
      anoAnt: anoAnt || null, vsAnoAnt: anoAnt ? valor - anoAnt : null, vsAnoAntPct: variacao(valor, anoAnt),
    };
  };
  return {
    receita: dre.temReceitas ? linha(dre.receitas.total, dreAnt && dreAnt.temReceitas ? dreAnt.receitas.total : null) : null,
    despesa: linha(dre.operacional, dreAnt ? dreAnt.operacional : null),
    resultado: dre.temReceitas ? linha(dre.resultado, dreAnt && dreAnt.temReceitas ? dreAnt.resultado : null) : null,
  };
}

// Folhas do DRE (onde o valor é lançado/orçado): códigos de despesa (ou a
// classe, quando não tem códigos ou o orçado é da classe inteira) e
// classes de receita. Só o operacional + receitas -- o que entra no
// resultado.
export function folhasDoDre(dre) {
  const out = [];
  // abrir = chaves de linha da tabela do DRE (ver ui_dre.js) que mostram a
  // conta -- pro atalho do painel levar direto a ela.
  const visitar = (n, nivel, caminho, abrir) => {
    const filhos = n.filhos || [];
    if (nivel === 3 || !filhos.length || (nivel === 2 && n.orcNaClasse)) {
      out.push({ tipo: 'despesa', id: n.id, codigo: n.codigo, nome: n.nome, caminho, rea: n.rea, orc: n.orc, nivel, abrir });
      return;
    }
    filhos.forEach(f => {
      const k = nivel === 1 ? `c:${n.id || n.nome}` : `cl:${abrir[0].slice(2)}:${n.id || n.nome}`;
      visitar(f, nivel + 1, n.nome, [...abrir, k]);
    });
  };
  dre.operacional.centros.forEach(c => visitar(c, 1, '', []));
  if (dre.temReceitas) {
    dre.receitas.grupos.forEach(g => g.filhos.forEach(c => out.push({ tipo: 'receita', id: null, codigo: '', nome: c.nome, caminho: g.nome, rea: c.rea, orc: c.orc, nivel: 2, abrir: [`r:${g.chave}`] })));
  }
  return out;
}

const chaveFolha = (f) => `${f.tipo}|${f.caminho}|${f.nome}`;

// Contas que mais mudaram no mês: vs mês anterior, vs orçado e -- quando
// há o ano anterior (dreAnt) -- vs o mesmo mês do ano passado. Pra
// despesa, alta é ruim; pra receita, é boa (`bom` diz qual é qual).
export function maioresVariacoes(dre, mes, limite = 5, dreAnt = null) {
  const folhas = folhasDoDre(dre);
  const i = mes - 1;
  const comBom = (f, delta) => ({ ...f, delta, bom: f.tipo === 'receita' ? delta > 0 : delta < 0 });
  const top = (lista) => lista.filter(f => Math.abs(f.delta) >= 1).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, limite);
  const vsMesAnt = mes > 1 ? top(folhas.map(f => comBom(f, f.rea[i] - f.rea[i - 1]))) : [];
  const vsOrc = top(folhas.filter(f => f.orc[i] > 0).map(f => comBom(f, f.rea[i] - f.orc[i])));
  let vsAnoAnt = [];
  if (dreAnt) {
    const ant = new Map(folhasDoDre(dreAnt).map(f => [chaveFolha(f), f.rea[i]]));
    vsAnoAnt = top(folhas.filter(f => ant.get(chaveFolha(f))).map(f => comBom(f, f.rea[i] - ant.get(chaveFolha(f)))));
  }
  return { vsMesAnt, vsOrc, vsAnoAnt };
}

// Último mês do ano com algum realizado (pra abrir o "mês em foco" nele),
// limitado a ateMes.
export function ultimoMesComDados(dre, ateMes) {
  const tem = (i) => (dre.operacional.rea[i] || 0) !== 0 || (dre.temReceitas && (dre.receitas.total.rea[i] || 0) !== 0);
  for (let i = Math.min(ateMes || 12, 12) - 1; i >= 0; i--) if (tem(i)) return i + 1;
  return Math.max(1, Math.min(ateMes || 1, 12));
}

const brl = (v) => `R$ ${Math.round(Math.abs(v)).toLocaleString('pt-BR')}`;
const brlMil = (v) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `R$ ${(a / 1e6).toFixed(2).replace('.', ',')} mi`;
  if (a >= 1e3) return `R$ ${Math.round(a / 1e3).toLocaleString('pt-BR')} mil`;
  return brl(a);
};
const pct = (v) => `${Math.round(Math.abs(v) * 100)}%`;

// Leitura automática: 3 a 5 frases curtas, das mais importantes pras
// menos, sobre o mês em foco e o acumulado. Cada frase vem com um tom
// (bom / alerta / neutro) pra tela pôr o ícone. extras: { cobertura, difCp,
// recebidoFaturado, inadRecente } -- o que a tela já calculou.
export function leituraAutomatica(dre, mes, cmp, variacoes, extras = {}) {
  const frases = [];
  const m = nomeMes(mes);
  const { despesa, receita, resultado } = cmp;
  if (resultado && (resultado.valor || resultado.orc)) {
    const margem = receita && receita.valor ? resultado.valor / receita.valor : null;
    frases.push({
      tom: resultado.valor >= 0 ? 'bom' : 'alerta',
      texto: `Em ${m}, ${resultado.valor >= 0 ? 'sobraram' : 'faltaram'} ${brlMil(resultado.valor)} depois de pagar a operação${margem !== null ? ` -- de cada R$ 100 de receita, ${resultado.valor >= 0 ? 'ficaram' : 'faltaram'} R$ ${Math.abs(Math.round(margem * 100))}` : ''}.`,
    });
  }
  if (despesa && despesa.orc) {
    const acima = despesa.vsOrc > 0;
    const puxou = variacoes.vsOrc.find(v => v.tipo === 'despesa' && (acima ? v.delta > 0 : v.delta < 0));
    frases.push({
      tom: acima ? 'alerta' : 'bom',
      texto: `Despesas de ${m} ficaram ${pct(despesa.vsOrcPct)} ${acima ? 'acima' : 'abaixo'} do orçado (${acima ? '+' : '−'}${brlMil(despesa.vsOrc)})${puxou ? `, ${acima ? 'puxadas' : 'principalmente'} por ${puxou.nome} (${puxou.delta > 0 ? '+' : '−'}${brlMil(puxou.delta)})` : ''}.`,
    });
  } else if (despesa && despesa.vsMesAntPct !== null && Math.abs(despesa.vsMesAntPct) >= 0.05) {
    const subiu = despesa.vsMesAnt > 0;
    const puxou = variacoes.vsMesAnt.find(v => v.tipo === 'despesa' && (subiu ? v.delta > 0 : v.delta < 0));
    frases.push({
      tom: subiu ? 'alerta' : 'bom',
      texto: `Despesas ${subiu ? 'subiram' : 'caíram'} ${pct(despesa.vsMesAntPct)} em relação ao mês anterior${puxou ? `; o que mais ${subiu ? 'subiu' : 'caiu'} foi ${puxou.nome} (${puxou.delta > 0 ? '+' : '−'}${brlMil(puxou.delta)})` : ''}.`,
    });
  }
  if (receita && receita.orc) {
    const acima = receita.vsOrc >= 0;
    frases.push({ tom: acima ? 'bom' : 'alerta', texto: `Receitas de ${m} ${acima ? 'superaram o' : 'ficaram abaixo do'} orçado em ${pct(receita.vsOrcPct)} (${acima ? '+' : '−'}${brlMil(receita.vsOrc)}).` });
  } else if (receita && receita.vsAnoAntPct !== null) {
    const subiu = receita.vsAnoAnt >= 0;
    frases.push({ tom: subiu ? 'bom' : 'alerta', texto: `Receitas de ${m} ${subiu ? 'cresceram' : 'caíram'} ${pct(receita.vsAnoAntPct)} sobre ${m} do ano passado.` });
  }
  if (resultado && !resultado.orc && resultado.vsAnoAntPct !== null && Math.abs(resultado.vsAnoAntPct) >= 0.05) {
    const subiu = resultado.vsAnoAnt >= 0;
    frases.push({ tom: subiu ? 'bom' : 'alerta', texto: `O resultado de ${m} foi ${pct(resultado.vsAnoAntPct)} ${subiu ? 'maior' : 'menor'} que em ${m} do ano passado (${subiu ? '+' : '−'}${brlMil(resultado.vsAnoAnt)}).` });
  }
  if (extras.recebidoFaturado !== undefined && extras.recebidoFaturado !== null) {
    const r = extras.recebidoFaturado;
    frases.push({ tom: r >= 0.95 ? 'bom' : 'alerta', texto: `Do que foi faturado para ${m}, ${pct(r)} já entrou no caixa.` });
  }
  if (extras.inadRecente) {
    frases.push({ tom: 'alerta', texto: `Há ${brlMil(extras.inadRecente)} vencidos há até 90 dias ainda em aberto -- o que dá para cobrar agora.` });
  }
  if (extras.difCp && Math.abs(extras.difCp) >= 1) {
    frases.push({ tom: 'neutro', texto: `Group e Central CP diferem em ${brlMil(extras.difCp)} nas despesas de ${m} -- veja a aba Conciliação.` });
  }
  return frases.slice(0, 5);
}
