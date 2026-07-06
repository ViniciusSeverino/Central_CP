// src/js/prazo_despesa.js
//
// Prazo de pagamento por tipo de despesa (documento WE9 "Processos de
// Contas a Pagar", seção "Prazo de Despesas -- Abertura de Chamado"),
// contado a partir de `data_chamado` (quando o Contas a Pagar abre o
// chamado pro CSC -- é aí que o relógio do CSC começa a correr, não no
// lançamento). "Allowance" aparece no documento em dois grupos com
// prazos diferentes (D+10 corridos e D+3 úteis) -- confirmado com o
// usuário que fica no grupo D+10.
//
// "Padrão" (não exceção) também é o tipo que trava o vencimento na
// quarta-feira do lote semanal (ver vencimento_comum.js) -- os dois
// campos derivam do mesmo "isso é uma despesa comum ou uma exceção?",
// por isso `pagamento_excecao` (coluna já existente) é só
// `tipo_despesa_prazo !== 'padrao'`, calculado ao salvar.
import { feriadosNacionais } from './vencimento_comum.js';

export const TIPO_DESPESA_LABEL = {
  padrao: 'Padrão (aluguel, condomínio, fornecedores em geral)',
  d10: 'CAPEX / Guia de impostos / Allowance / FOPAG / Transferência entre contas / Distribuição de resultados / Reembolsos / Benefícios / SERASA',
  rescisao: 'Rescisão trabalhista',
  d3_util: 'Google / Facebook / Mercado de Energia / Custas judiciais',
  dare: 'DARE',
};

// Rótulo resumido pro <select> (a descrição completa some no meio de
// opções tão longas) -- a descrição completa aparece como legenda abaixo
// do campo quando o tipo é selecionado, ver TIPO_DESPESA_LABEL acima.
export const TIPO_DESPESA_LABEL_CURTO = {
  padrao: 'D+30 (padrão)',
  d10: 'D+10',
  rescisao: 'D+7 (rescisão)',
  d3_util: 'D+3 útil',
  dare: 'D+1 útil (DARE)',
};

// dias: quantidade do prazo. util: true = dias úteis (pula fim de semana
// e feriado nacional), false = dias corridos (conta todo santo dia).
export const TIPO_DESPESA_PRAZO = {
  padrao: { dias: 30, util: false },
  d10: { dias: 10, util: false },
  rescisao: { dias: 7, util: false },
  d3_util: { dias: 3, util: true },
  dare: { dias: 1, util: true },
};

function copiarData(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function adicionarDias(d, n) {
  const copia = copiarData(d);
  copia.setDate(copia.getDate() + n);
  return copia;
}

function formatarISO(d) {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

// Dia útil bancário genérico (fim de semana + feriado nacional) -- ao
// contrário da regra de vencimento comum, NÃO empurra por causa do dia
// 1º do mês (essa restrição é exclusiva da concentração de vencimentos
// às quartas-feiras, não de prazo de pagamento em geral).
function ehDiaUtil(d) {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  return !feriadosNacionais(d.getFullYear()).has(formatarISO(d));
}

// Data-limite (string AAAA-MM-DD) pra pagar, a partir da abertura do
// chamado -- dataChamado pode vir como Date, string ISO com hora
// (timestamptz de verdade, coluna `data_chamado`) ou string AAAA-MM-DD.
export function calcularPrazoLimite(tipoDespesa, dataChamado) {
  if (!dataChamado) return null;
  const cfg = TIPO_DESPESA_PRAZO[tipoDespesa] || TIPO_DESPESA_PRAZO.padrao;
  let alvo = copiarData(new Date(dataChamado));
  if (!cfg.util) {
    alvo = adicionarDias(alvo, cfg.dias);
  } else {
    let restantes = cfg.dias;
    while (restantes > 0) {
      alvo = adicionarDias(alvo, 1);
      if (ehDiaUtil(alvo)) restantes--;
    }
  }
  return formatarISO(alvo);
}

function diasEntre(isoInicio, isoFim) {
  const a = new Date(isoInicio + 'T00:00:00Z').getTime();
  const b = new Date(isoFim + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}

// { limite, diasRestantes, atrasado } -- diasRestantes negativo quando
// atrasado. Retorna null se o chamado ainda não foi aberto (prazo do CSC
// só começa a contar a partir daí).
export function statusPrazo(tipoDespesa, dataChamado, hoje = new Date()) {
  const limite = calcularPrazoLimite(tipoDespesa, dataChamado);
  if (!limite) return null;
  const diasRestantes = diasEntre(formatarISO(copiarData(hoje)), limite);
  return { limite, diasRestantes, atrasado: diasRestantes < 0 };
}
