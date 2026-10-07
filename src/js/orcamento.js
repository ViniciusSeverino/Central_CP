// src/js/orcamento.js
//
// Orçamento anual do DRE (ver migration 0055 / dre.js) -- lógica pura,
// sem DOM: o plano de contas de cada pagador (pro modelo de planilha) e a
// leitura da planilha preenchida (pra importação). Planilha e tela em
// export_excel.js (exportarModeloOrcamento) e ui_orcamento.js.
//
// Cada pagador tem o próprio plano: os centros de custo cujo
// origem_siglas inclui a sigla do pagador (mesmo critério do formulário de
// nota). Os códigos se repetem entre pagadores (2.01 é ADMINISTRATIVO no
// Condomínio e DESPESAS PESSOAL no Consórcio), por isso a leitura casa o
// código SEMPRE dentro do plano do pagador daquela aba.
//
// O orçado pode vir por CÓDIGO (nível mais fino) ou por CLASSE inteira.
// Se a mesma classe vier dos dois jeitos, valem os códigos e o valor da
// classe é ignorado (com aviso) -- senão o mesmo dinheiro contaria duas vezes.

const cmp = (a, b) => String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true });

export function planoDoPagador(cadastros, pagador) {
  const centrosTodos = cadastros.centros_custo || [];
  const temOrigem = centrosTodos.some(c => (c.origem_siglas || []).length);
  const centros = centrosTodos.filter(c => !temOrigem || (c.origem_siglas || []).includes(pagador.sigla)).slice().sort(cmp);
  return centros.map(c => ({
    centro: c,
    classes: (cadastros.classes_conta || []).filter(cl => cl.centro_custo_id === c.id).slice().sort(cmp).map(cl => ({
      classe: cl,
      codigos: (cadastros.codigos_classificacao || []).filter(co => co.classe_conta_id === cl.id).slice().sort(cmp),
    })),
  }));
}

const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  // "1.234,56" (texto colado do Excel em pt-BR) ou "1234.56"
  const t = String(v).trim().replace(/\s|R\$/g, '');
  const n = t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t);
  return Number.isFinite(n) ? n : NaN;
};

// linhas: [{ codigo, meses: [12 valores crus] }] de UMA aba (um pagador).
// Devolve os registros prontos pro banco + o que mostrar na prévia.
export function interpretarOrcamento(linhas, cadastros, pagador) {
  const plano = planoDoPagador(cadastros, pagador);
  const classesPorCodigo = new Map();
  const codigosPorCodigo = new Map();
  plano.forEach(p => p.classes.forEach(c => {
    classesPorCodigo.set(String(c.classe.codigo).trim(), c.classe);
    c.codigos.forEach(co => codigosPorCodigo.set(String(co.codigo).trim(), co));
  }));
  const porCodigo = [];
  const porClasse = [];
  const naoReconhecidos = [];
  const invalidos = [];
  for (const l of linhas) {
    const codigo = String(l.codigo == null ? '' : l.codigo).trim();
    const valores = (l.meses || []).slice(0, 12).map(num);
    if (!codigo) continue;
    if (valores.some(v => Number.isNaN(v))) { invalidos.push(codigo); continue; }
    if (!valores.some(v => v)) continue; // linha sem valor nenhum: nada a importar
    const co = codigosPorCodigo.get(codigo);
    const cl = !co && classesPorCodigo.get(codigo);
    if (co) porCodigo.push({ conta: co, valores });
    else if (cl) porClasse.push({ conta: cl, valores });
    else if (/^\d/.test(codigo)) naoReconhecidos.push(codigo); // ignora títulos/linhas de texto
  }
  const classesComCodigo = new Set(porCodigo.map(p => p.conta.classe_conta_id));
  const ignoradas = porClasse.filter(p => classesComCodigo.has(p.conta.id)).map(p => p.conta.codigo);
  const registros = [];
  const totaisMes = Array(12).fill(0);
  const add = (chave, id, valores) => valores.forEach((v, i) => {
    if (!v) return;
    registros.push({ mes: i + 1, [chave]: id, valor: Math.round(v * 100) / 100 });
    totaisMes[i] += v;
  });
  porCodigo.forEach(p => add('codigo_classificacao_id', p.conta.id, p.valores));
  porClasse.filter(p => !classesComCodigo.has(p.conta.id)).forEach(p => add('classe_conta_id', p.conta.id, p.valores));
  return {
    registros,
    totaisMes,
    total: totaisMes.reduce((s, v) => s + v, 0),
    contas: porCodigo.length + porClasse.length - ignoradas.length,
    naoReconhecidos,
    invalidos,
    classesIgnoradas: ignoradas,
  };
}

// Orçado já gravado de um pagador/ano, por conta, pra pré-preencher o
// modelo (baixar, ajustar, reimportar). Chave = id do código ou da classe.
export function orcadoPorConta(orcamento, pagadorId, ano) {
  const out = new Map();
  (orcamento || []).filter(o => o.pagador_id === pagadorId && o.ano === ano).forEach(o => {
    const k = o.codigo_classificacao_id || o.classe_conta_id;
    if (!out.has(k)) out.set(k, Array(12).fill(0));
    out.get(k)[o.mes - 1] += Number(o.valor) || 0;
  });
  return out;
}
