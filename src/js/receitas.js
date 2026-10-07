// src/js/receitas.js
//
// Receitas do Group (relatório "Pesquisa de Receitas - Por Conta", CSV) --
// lógica pura, sem DOM. Leitura do arquivo, grupos de receita e as linhas
// do DRE nos dois regimes. Tela da importação em ui_orcamento.js; DRE em
// dre.js / ui_dre.js.
//
// O que o arquivo traz (export de 07/10/2026, 28.631 linhas):
// - mesmo formato do de despesas (latin1, ";", aspas, dd/mm/aaaa, 1.234,56);
// - Categoria = pagador, numerada ("1 - Condomínio", "2 - Fundo de
//   Promoção", "3 - Empreendedores");
// - Classe da Conta: ALUGUEL MÍNIMO, ENCARGO COMUM, CONDOMINIO... O "*" na
//   frente marca a cobrança automática -- é a mesma classe, então sai;
// - Faturado (o cobrado) e Valor Liquido (o recebido, com juros, multa e
//   correção, menos desconto);
// - Emissão (competência), Vencimento, Recebimento (caixa), Situação
//   (Baixada = recebido; Emitida/Criada = em aberto);
// - LUC (loja), Sacado (lojista), Conta (conta corrente), Núm. Acordo.
import { lerCsv, valorBr, dataBr, pagadorDaCategoria, normalizar } from './group_importacao.js';

// Data com hora ("03/02/2026 00:00:00") ou sem.
const data = (s) => dataBr(String(s || '').trim().slice(0, 10));
export const classeDaReceita = (s) => String(s || '').replace(/^\s*\*+\s*/, '').replace(/\s+/g, ' ').trim().toUpperCase();

export function interpretarRelatorioReceitas(texto, pagadores) {
  const linhas = lerCsv(texto);
  if (!linhas.length) throw new Error('Arquivo vazio.');
  const cab = linhas[0].map(h => h.trim());
  const col = (nome) => cab.indexOf(nome);
  const obrig = ['ID', 'Categoria', 'Classe da Conta', 'Faturado', 'Valor Liquido', 'Emissão', 'Vencimento', 'Recebimento', 'Situação'];
  const faltando = obrig.filter(n => col(n) < 0);
  if (faltando.length) throw new Error(`Não parece o relatório "Pesquisa de Receitas - Por Conta" do Group -- faltam as colunas: ${faltando.join(', ')}.`);
  const pega = (l, nome) => (col(nome) >= 0 ? (l[col(nome)] || '').trim() : '');
  const receitas = [];
  const categoriasSemPagador = new Set();
  for (const l of linhas.slice(1)) {
    const pagador = pagadorDaCategoria(pega(l, 'Categoria'), pagadores);
    if (!pagador) { categoriasSemPagador.add(pega(l, 'Categoria')); continue; }
    const id = Number(pega(l, 'ID'));
    if (!id) continue;
    receitas.push({
      id_group: id,
      pagador_id: pagador.id,
      classe: classeDaReceita(pega(l, 'Classe da Conta')),
      classe_original: pega(l, 'Classe da Conta') || null,
      tipo: pega(l, 'Tipo') || null,
      luc: pega(l, 'LUC') || null,
      sacado: pega(l, 'Sacado') || null,
      mes_ref: pega(l, 'Mes Ref') || null,
      emissao: data(pega(l, 'Emissão')),
      vencimento: data(pega(l, 'Vencimento')),
      venc_original: data(pega(l, 'Venc. Original')),
      recebimento: data(pega(l, 'Recebimento')),
      liquidacao: data(pega(l, 'Liquidação')),
      situacao: pega(l, 'Situação') || null,
      faturado: valorBr(pega(l, 'Faturado')),
      desconto: valorBr(pega(l, 'Desc. Baixa')),
      juros: valorBr(pega(l, 'Juros Baixa')),
      multa: valorBr(pega(l, 'Multa Baixa')),
      correcoes: valorBr(pega(l, 'Correções Baixa')),
      valor_liquido: valorBr(pega(l, 'Valor Liquido')),
      conta: pega(l, 'Conta') || null,
      num_acordo: pega(l, 'Núm. Acordo') || null,
    });
  }
  return { receitas, categoriasSemPagador: Array.from(categoriasSemPagador).filter(Boolean) };
}

export const recebida = (r) => /baixad/i.test(r.situacao || '');

// Grupos de receita pro DRE ficar legível (cada um abre nas classes). Pela
// ordem: a primeira regra que bate vale -- "CONDOMINIO CONFISSÃO" é acordo,
// não encargo.
export const GRUPOS_RECEITA = [
  { chave: 'acordos', label: 'Recuperações e acordos', regra: /CONFISS|MESES ANT|RECUPERA|ACORDO|CUSTAS|JUDIC/ },
  { chave: 'alugueis', label: 'Aluguéis', regra: /ALUGUEL|LUVAS|RES SPERATA|CESSAO/ },
  { chave: 'fundo', label: 'Fundo de promoção', regra: /FUNDO DE PROMO|FPP|MERCHANDISING|MIDIA|PATROCIN/ },
  { chave: 'encargos', label: 'Encargos e rateios', regra: /CONDOMINIO|ENCARGO|ENERGIA|AGUA|AR CONDICIONADO|GAS|IPTU|SEGURO|HIGIENE|VISTORIA|ESTACIONAMENTO|TAXA/ },
  { chave: 'financeiras', label: 'Receitas financeiras', regra: /RENDIMENTO|APLICA|JUROS/ },
  { chave: 'outras', label: 'Outras receitas', regra: /.*/ },
];
export function grupoDaReceita(classe) {
  const n = normalizar(classe).toUpperCase();
  return (GRUPOS_RECEITA.find(g => g.regra.test(n)) || GRUPOS_RECEITA[GRUPOS_RECEITA.length - 1]).chave;
}

const mesDe = (v) => (v ? String(v).slice(0, 7) : null);
// "MM/AAAA" -> "AAAA-MM".
export const mesDoMesRef = (v) => { const m = /^(\d{2})\/(\d{4})$/.exec(String(v || '').trim()); return m ? `${m[2]}-${m[1]}` : null; };

// Uma linha por receita, no formato do DRE. Competência: o Mes Ref do Group
// (mês de referência da cobrança), valor faturado -- a Emissão é a data do
// boleto e oscila demais pra ser competência (no Condomínio: R$ 0,8 mi em
// abr/26 e R$ 6,0 mi em mai/26, contra ~R$ 2,1 mi todo mês pelo Mes Ref);
// sem Mes Ref, a emissão. Caixa: mês do recebimento, valor líquido
// recebido (com juros/multa), só o que foi baixado.
export function linhasReceita(receitas, { pagadorId, regime = 'competencia' }) {
  const out = [];
  for (const r of receitas || []) {
    if (pagadorId && r.pagador_id !== pagadorId) continue;
    const caixa = regime === 'caixa';
    if (caixa && !recebida(r)) continue;
    const mes = caixa ? mesDe(r.recebimento) : (mesDoMesRef(r.mes_ref) || mesDe(r.emissao));
    if (!mes) continue;
    const valor = Number(caixa ? r.valor_liquido : r.faturado) || 0;
    if (!valor) continue;
    out.push({ id: r.id_group, mes, valor, classe: r.classe, grupo: grupoDaReceita(r.classe) });
  }
  return out;
}

// Classes de receita de um pagador (pro modelo do orçamento), por grupo e
// nome.
export function classesDeReceita(receitas, pagadorId) {
  const set = new Set((receitas || []).filter(r => r.pagador_id === pagadorId).map(r => r.classe).filter(Boolean));
  const ordem = Object.fromEntries(GRUPOS_RECEITA.map((g, i) => [g.chave, i]));
  return Array.from(set).sort((a, b) => ordem[grupoDaReceita(a)] - ordem[grupoDaReceita(b)] || a.localeCompare(b, 'pt-BR'));
}

// Em aberto vencido (inadimplência) numa data, por faixa de atraso.
export const FAIXAS_ATRASO = [
  { chave: 'a30', label: '1 a 30 dias', ate: 30 },
  { chave: 'a90', label: '31 a 90 dias', ate: 90 },
  { chave: 'a180', label: '91 a 180 dias', ate: 180 },
  { chave: 'a365', label: '181 a 365 dias', ate: 365 },
  { chave: 'mais', label: 'Mais de 1 ano', ate: Infinity },
];
export function inadimplencia(receitas, { pagadorId, hoje = new Date() }) {
  const ref = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const faixas = Object.fromEntries(FAIXAS_ATRASO.map(f => [f.chave, { ...f, valor: 0, qtd: 0 }]));
  let total = 0;
  for (const r of receitas || []) {
    if (pagadorId && r.pagador_id !== pagadorId) continue;
    if (recebida(r) || !r.vencimento) continue;
    const [a, m, d] = r.vencimento.split('-').map(Number);
    const dias = Math.floor((ref - Date.UTC(a, m - 1, d)) / 86400000);
    const valor = Number(r.faturado) || 0;
    if (dias <= 0 || valor <= 0) continue;
    const f = FAIXAS_ATRASO.find(x => dias <= x.ate);
    faixas[f.chave].valor += valor; faixas[f.chave].qtd++;
    total += valor;
  }
  return { total, recente: faixas.a30.valor + faixas.a90.valor, faixas: FAIXAS_ATRASO.map(f => faixas[f.chave]) };
}
