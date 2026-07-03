// src/js/vencimento_comum.js
//
// Regra operacional do CSC (documento WE9 "Processos de Contas a Pagar" +
// ajuste combinado com o Contas a Pagar do shopping): pagamento COMUM (não
// exceção) só vence às quartas-feiras, pra concentrar a remessa bancária
// semanal. A janela de lançamento é sexta a quinta -- assim o Contas a
// Pagar sempre tem a sexta-feira livre pra fechar a semana anterior e
// abrir os chamados, sem lançamento novo atrapalhando.
//
// A quarta-feira de vencimento é: a quarta-feira DENTRO da janela de
// lançamento (sexta a quinta) + 5 semanas. Ex.: lançamento feito entre
// sexta 26/06 e quinta 02/07 (janela cuja quarta é 01/07) só pode vencer
// em 05/08 (01/07 + 35 dias). Lançamento feito já na sexta 03/07 (início
// da janela seguinte, cuja quarta é 08/07) vence em 12/08.
//
// Se a quarta calculada cair em feriado nacional ou no dia 1º do mês,
// empurra pra próxima quarta-feira (mais 7 dias), repetindo até achar uma
// quarta-feira válida.
//
// Tudo em aritmética de calendário local (getFullYear/getMonth/getDate),
// nunca por string ISO + fuso -- mesma lição do bug de fmtDate() em
// state.js: aqui não tem string vinda do banco pra parsear, é uma data
// nova calculada a partir de "hoje", então os getters locais do Date são
// o jeito certo (refletem o dia corrido de verdade pra quem está usando
// o app no fuso do Brasil).

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

// Algoritmo de Meeus/Jones/Butcher (Gregoriano) -- domingo de Páscoa.
export function pascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

// Só feriados nacionais (fixos + móveis calculados a partir da Páscoa) --
// não cobre feriado municipal/estadual (ex: Bauru), que fica de fora por
// decisão explícita (custo de manter um cadastro à parte não valeu a pena
// frente ao ganho de cobertura).
export function feriadosNacionais(ano) {
  const dom = pascoa(ano);
  const datas = [
    new Date(ano, 0, 1),   // Confraternização Universal
    adicionarDias(dom, -48), // Segunda-feira de Carnaval
    adicionarDias(dom, -47), // Terça-feira de Carnaval
    adicionarDias(dom, -2),  // Sexta-feira Santa
    adicionarDias(dom, 60),  // Corpus Christi
    new Date(ano, 3, 21),  // Tiradentes
    new Date(ano, 4, 1),   // Dia do Trabalho
    new Date(ano, 8, 7),   // Independência
    new Date(ano, 9, 12),  // Nossa Senhora Aparecida
    new Date(ano, 10, 2),  // Finados
    new Date(ano, 10, 15), // Proclamação da República
    new Date(ano, 10, 20), // Consciência Negra (nacional desde 2024)
    new Date(ano, 11, 25), // Natal
  ];
  return new Set(datas.map(formatarISO));
}

export function ehFeriadoOuDiaUm(d) {
  if (d.getDate() === 1) return true;
  return feriadosNacionais(d.getFullYear()).has(formatarISO(d));
}

// Volta até a sexta-feira mais recente (inclusive, se "hoje" já é sexta) --
// início da janela de lançamento sexta-a-quinta que contém "hoje".
export function inicioDaJanelaDeLancamento(hoje) {
  const diaSemana = hoje.getDay(); // 0=dom ... 5=sex, 6=sab
  const diasParaVoltar = (diaSemana - 5 + 7) % 7;
  return adicionarDias(hoje, -diasParaVoltar);
}

// Data (string AAAA-MM-DD) de vencimento permitida pra um pagamento comum
// lançado "hoje". Empurra pra próxima quarta-feira enquanto cair em
// feriado nacional ou no dia 1º do mês.
export function calcularVencimentoComum(hoje = new Date()) {
  const sexta = inicioDaJanelaDeLancamento(hoje);
  let alvo = adicionarDias(sexta, 5 + 35); // quarta da janela (+5) + 5 semanas (+35)
  while (ehFeriadoOuDiaUm(alvo)) alvo = adicionarDias(alvo, 7);
  return formatarISO(alvo);
}
