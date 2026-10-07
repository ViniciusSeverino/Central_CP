// src/js/group_importacao.js
//
// Relatório "Pesquisa de Despesas" exportado do Group (CSV) -> lançamentos
// prontos pro DRE (coluna "Group", o realizado oficial) e pra conciliação
// com o Central CP. Lógica pura, sem DOM (a tela é a seção "Despesas do
// Group" em Configurações › Orçamento, ver ui_orcamento.js).
//
// O que o arquivo traz (ver o export de 07/10/2026):
// - latin1, separador ";", tudo entre aspas, datas dd/mm/aaaa, valores
//   "1.234,56";
// - Categoria = o pagador (Condomínio / Fundo de Promoção / Empreendedores
//   = Condomínio / FPP / Consórcio no Central CP);
// - Centro de Custo + Classe de Conta = o plano do Group. A "classe" do
//   Group é o CÓDIGO do Central CP ("13º", "Assistência Médica"...). Os
//   códigos numéricos do Group não batem com os nossos (e o Group trocou a
//   numeração no meio de 2026), por isso o casamento é pelo NOME;
// - retenções vêm em linhas próprias com sufixo na classe ("Limpeza
//   Terceirizada - INSS 11%", "- ISS 2%", "- PIS/COFINS/CSLL"): somadas à
//   linha principal dão o bruto -- então caem na mesma conta;
// - Movimento = o nº de lançamento no Group que o Central CP guarda em
//   cada nota (numero_lancamento_group) -- a chave da conciliação;
// - Descrição, Favorecido, Criação, Liquidação, Referencia (conta
//   corrente), Documento/Borderô e Parcela só servem pra conciliação
//   identificar o lançamento (opcionais: coluna ausente = nulo).
import { planoDoPagador } from './orcamento.js';

// Linhas de um CSV com ";" e aspas (aspas duplicadas = aspa literal).
export function lerCsv(texto) {
  const linhas = [];
  let campo = '', linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ';') { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some(v => v !== '')) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some(v => v !== '')) linhas.push(linha);
  return linhas;
}

export const valorBr = (s) => {
  const t = String(s == null ? '' : s).trim().replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return t && Number.isFinite(n) ? n : 0;
};
export const dataBr = (s) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
// Nome comparável: sem acento, minúsculo, espaços (inclusive o &nbsp; que o
// Group às vezes põe) colapsados.
export const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

const SUFIXO_RETENCAO = / - (?=(IRRF|INSS|ISS|PIS|COFINS|CSLL|CSRF)\b)/;
export function classeBase(classe) {
  const texto = String(classe || '').replace(/ /g, ' ');
  const partes = texto.split(SUFIXO_RETENCAO);
  return { base: partes[0].trim(), retencao: partes.length > 1 };
}

// Categoria do Group -> pagador do Central CP. O relatório de receitas
// numera a categoria ("1 - Condomínio"); o de despesas, não.
const CATEGORIA_SIGLA = { condominio: 'COND', 'fundo de promocao': 'FPP', empreendedores: 'CONS' };
export function pagadorDaCategoria(categoria, pagadores) {
  const n = normalizar(categoria).replace(/^\d+\s*-\s*/, '');
  const sigla = CATEGORIA_SIGLA[n];
  return (pagadores || []).find(p => (sigla && p.sigla === sigla) || normalizar(p.nome) === n || normalizar(p.sigla) === n) || null;
}

// Qual relatório do Group é: despesas ("Pesquisa de Despesas") ou receitas
// ("Pesquisa de Receitas - Por Conta"), pelo cabeçalho. null = nenhum.
export function tipoDoRelatorio(texto) {
  const fim = texto.search(/\r?\n/);
  const cab = lerCsv(fim >= 0 ? texto.slice(0, fim) : texto)[0] || [];
  const tem = (n) => cab.some(h => h.trim() === n);
  if (tem('Sacado') && tem('Faturado') && tem('Recebimento')) return 'receitas';
  if (tem('Movimento') && tem('Classe de Conta')) return 'despesas';
  return null;
}

// Texto do CSV -> lançamentos (um por linha do relatório).
export function interpretarRelatorioGroup(texto, pagadores) {
  const linhas = lerCsv(texto);
  if (!linhas.length) throw new Error('Arquivo vazio.');
  const cab = linhas[0].map(h => h.trim());
  const col = (nome) => cab.indexOf(nome);
  const obrig = ['ID', 'Categoria', 'Centro de Custo', 'Classe de Conta', 'Valor', 'Vencimento', 'Movimento'];
  const faltando = obrig.filter(n => col(n) < 0);
  if (faltando.length) throw new Error(`Não parece o relatório "Pesquisa de Despesas" do Group -- faltam as colunas: ${faltando.join(', ')}.`);
  const pega = (l, nome) => (col(nome) >= 0 ? (l[col(nome)] || '').trim() : '');
  const lancamentos = [];
  const categoriasSemPagador = new Set();
  for (const l of linhas.slice(1)) {
    const pagador = pagadorDaCategoria(pega(l, 'Categoria'), pagadores);
    if (!pagador) { categoriasSemPagador.add(pega(l, 'Categoria')); continue; }
    const { base, retencao } = classeBase(pega(l, 'Classe de Conta'));
    lancamentos.push({
      id_group: Number(pega(l, 'ID')) || null,
      movimento: pega(l, 'Movimento') || null,
      pagador_id: pagador.id,
      mes_ref: pega(l, 'Mes Ref.') || null,
      vencimento: dataBr(pega(l, 'Vencimento')),
      pagamento: dataBr(pega(l, 'Pagamento')),
      situacao: pega(l, 'Situacao') || null,
      cod_cc: pega(l, 'Cod. CC') || null,
      centro_nome: pega(l, 'Centro de Custo'),
      cod_classe: pega(l, 'Cod. Classe') || null,
      classe_nome: pega(l, 'Classe de Conta'),
      classe_base: base,
      eh_retencao: retencao,
      fornecedor: pega(l, 'Fornecedor') || null,
      favorecido: pega(l, 'Favorecido') || null,
      descricao: pega(l, 'Descrição') || null,
      nota_fiscal: pega(l, 'Nota Fiscal') || null,
      criacao: dataBr(pega(l, 'Criação')),
      liquidacao: dataBr(pega(l, 'Liquidação')),
      referencia: pega(l, 'Referencia') || null,
      documento: pega(l, 'Documento') || pega(l, 'Borderô') || null,
      parcela: pega(l, 'Parcela') || null,
      valor: valorBr(pega(l, 'Valor')),
      valor_pago: valorBr(pega(l, 'Valor Pago')),
    });
  }
  return { lancamentos, categoriasSemPagador: Array.from(categoriasSemPagador).filter(Boolean) };
}

// Chave do par (pagador, centro do Group, classe base) -- usada no de-para.
export const chavePar = (pagadorId, centro, classe) => `${pagadorId}|${normalizar(centro)}|${normalizar(classe)}`;

// Monta o casador: (lançamento) -> { centroId, classeId, codigoId } do plano
// do Central CP, ou null quando não casa. Ordem: de-para manual; nome do
// centro (exato, depois um contido no outro -- o código numérico do Group
// não serve: no Consórcio "001 OPERACIONAIS" é o nosso 2.10); dentro do
// centro, a conta (ver acharConta).
export function criarCasador(cadastros, mapeamento) {
  const porPagador = new Map();
  const classesPorId = new Map((cadastros.classes_conta || []).map(c => [c.id, c]));
  const codigosPorId = new Map((cadastros.codigos_classificacao || []).map(c => [c.id, c]));
  const manual = new Map((mapeamento || []).map(m => [chavePar(m.pagador_id, m.centro_nome, m.classe_base), m]));
  const plano = (pagadorId) => {
    if (!porPagador.has(pagadorId)) {
      const pagador = (cadastros.pagadores || []).find(p => p.id === pagadorId);
      porPagador.set(pagadorId, pagador ? planoDoPagador(cadastros, pagador) : []);
    }
    return porPagador.get(pagadorId);
  };
  const acharCentro = (p, nome) => {
    const n = normalizar(nome);
    let c = p.find(x => normalizar(x.centro.nome) === n);
    if (!c && n) { const cand = p.filter(x => { const m = normalizar(x.centro.nome); return m.includes(n) || n.includes(m); }); if (cand.length === 1) c = cand[0]; }
    return c || null;
  };
  // Conta dentro do centro: nome do código igual; depois prefixo (o Group
  // corta o nome da classe em 30 caracteres); depois "todas as palavras do
  // Group estão no nome do código" com um candidato só (ex.: "Limpeza
  // Terceirizada" -> "Limpeza e Conservação Terceirizada"); por fim o nome
  // da classe. Os dois últimos jeitos voltam marcados como aproximados, pra
  // prévia mostrar e a pessoa confirmar ou corrigir no de-para.
  const palavras = (t) => normalizar(t).split(/[^a-z0-9º]+/).filter(w => w.length >= 3);
  const acharConta = (c, classe) => {
    const n = normalizar(classe);
    const codigos = c.classes.flatMap(cl => cl.codigos.map(co => ({ co, cl })));
    const ok = (x, aprox) => ({ centroId: c.centro.id, classeId: x.cl.classe ? x.cl.classe.id : x.cl.id, codigoId: x.co ? x.co.id : null, aproximado: !!aprox });
    let x = codigos.find(y => normalizar(y.co.nome) === n);
    if (x) return ok(x);
    if (n.length >= 10) {
      const pref = codigos.filter(y => { const m = normalizar(y.co.nome); return m.startsWith(n) || n.startsWith(m); });
      if (pref.length === 1) return ok(pref[0]);
    }
    const pw = palavras(classe);
    if (pw.length) {
      const sub = codigos.filter(y => { const mw = new Set(palavras(y.co.nome)); return pw.every(w => mw.has(w)); });
      if (sub.length === 1) return ok(sub[0], true);
    }
    const cl = c.classes.find(y => normalizar(y.classe.nome) === n);
    if (cl) return { centroId: c.centro.id, classeId: cl.classe.id, codigoId: null, aproximado: false };
    return null;
  };
  const cache = new Map();
  return (l) => {
    const k = chavePar(l.pagador_id, l.centro_nome, l.classe_base);
    if (cache.has(k)) return cache.get(k);
    let r = null;
    const m = manual.get(k);
    if (m) {
      const co = m.codigo_classificacao_id && codigosPorId.get(m.codigo_classificacao_id);
      const cl = co ? classesPorId.get(co.classe_conta_id) : (m.classe_conta_id && classesPorId.get(m.classe_conta_id));
      if (cl) r = { centroId: cl.centro_custo_id, classeId: cl.id, codigoId: co ? co.id : null, manual: true };
    }
    if (!r) {
      const c = acharCentro(plano(l.pagador_id), l.centro_nome);
      if (c) {
        r = acharConta(c, l.classe_base);
        if (!r) r = { centroId: c.centro.id, classeId: null, codigoId: null, soCentro: true };
      }
    }
    cache.set(k, r);
    return r;
  };
}

// Resumo pra prévia: por pagador (linhas, total) e os pares que não
// casaram até o código/classe (ordenados pelo valor, maior primeiro).
export function resumoImportacao(lancamentos, cadastros, mapeamento) {
  const casar = criarCasador(cadastros, mapeamento);
  const porPagador = new Map();
  const semCasamento = new Map();
  let valorCasado = 0, valorTotal = 0;
  for (const l of lancamentos) {
    const p = porPagador.get(l.pagador_id) || { pagadorId: l.pagador_id, linhas: 0, total: 0 };
    p.linhas++; p.total += l.valor;
    porPagador.set(l.pagador_id, p);
    valorTotal += l.valor;
    const r = casar(l);
    if (r && (r.codigoId || r.classeId)) { valorCasado += l.valor; continue; }
    const k = chavePar(l.pagador_id, l.centro_nome, l.classe_base);
    const s = semCasamento.get(k) || { pagadorId: l.pagador_id, centro_nome: l.centro_nome, classe_base: l.classe_base, centroId: r ? r.centroId : null, linhas: 0, valor: 0 };
    s.linhas++; s.valor += l.valor;
    semCasamento.set(k, s);
  }
  return {
    porPagador: Array.from(porPagador.values()),
    semCasamento: Array.from(semCasamento.values()).sort((a, b) => b.valor - a.valor),
    valorCasado, valorTotal,
  };
}
