// src/js/validacao_campos.js
//
// Validação dos campos que o leitor de documentos extrai (ver
// leitor_documentos.js), pelas regras PÚBLICAS de cada documento:
//   - CNPJ e CPF: dígitos verificadores (Receita Federal);
//   - linha digitável do boleto bancário (47 dígitos) e da conta de
//     concessionária/tributo (48 dígitos, começa com 8): DVs de cada campo
//     e o DV geral (FEBRABAN);
//   - chave de acesso da NF-e/NFC-e (44 dígitos): DV módulo 11, UF, ano/
//     mês e modelo (Manual de Orientação do Contribuinte);
//   - datas de calendário plausíveis e valores plausíveis.
// Um número que passa no dígito verificador quase certamente foi lido
// certo -- é isso que deixa o leitor preencher o campo com segurança, e
// descartar o que o OCR leu errado em vez de sugerir um valor errado.
//
// Também desfaz as confusões típicas do OCR (O/0, l/1, S/5, B/8) -- mas
// SÓ dentro de um trecho que já deveria ser numérico, e quem chama só
// aceita a correção se o dígito verificador passar depois dela.
//
// Tudo puro (sem DOM, sem rede). Testado em tests/regressao/
// validacao_campos.mjs.

export const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

const CONFUSOES = { O: '0', o: '0', l: '1', I: '1', '|': '1', i: '1', S: '5', s: '5', B: '8' };

// Troca as letras que o OCR costuma confundir com dígitos (O->0, l/I/|->1,
// S->5, B->8). Use só em trecho que deveria ser número.
export function corrigirConfusoes(trecho) {
  return String(trecho ?? '').replace(/[OolI|iSsB]/g, (c) => CONFUSOES[c]);
}

const repetido = (d) => /^(\d)\1+$/.test(d);

export function cnpjValido(valor) {
  const d = soDigitos(valor);
  if (d.length !== 14 || repetido(d)) return false;
  const calc = (base, pesos) => {
    const r = base.split('').reduce((s, x, i) => s + Number(x) * pesos[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(d.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(d[12]) && d2 === Number(d[13]);
}

export function cpfValido(valor) {
  const d = soDigitos(valor);
  if (d.length !== 11 || repetido(d)) return false;
  const calc = (base) => {
    const n = base.length + 1;
    const r = (base.split('').reduce((s, x, i) => s + Number(x) * (n - i), 0) * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(d.slice(0, 9)) === Number(d[9]) && calc(d.slice(0, 10)) === Number(d[10]);
}

export const formatarCnpj = (d) => `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
export const formatarCpf = (d) => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;

// Módulo 10: pesos 2,1 alternados da direita pra esquerda, somando os
// algarismos de cada produto.
export function mod10(s) {
  let peso = 2, soma = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const p = Number(s[i]) * peso;
    soma += p > 9 ? p - 9 : p;
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

// Soma do módulo 11 com pesos 2..9 da direita pra esquerda.
function somaMod11(s) {
  let peso = 2, soma = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    soma += Number(s[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  return soma;
}

// Boleto bancário: código de barras (44) a partir da linha digitável (47).
function codigoDeBarrasBancario(d) {
  return d.slice(0, 4) + d[32] + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
}

function linhaBancariaValida(d) {
  if (mod10(d.slice(0, 9)) !== Number(d[9])) return false;
  if (mod10(d.slice(10, 20)) !== Number(d[20])) return false;
  if (mod10(d.slice(21, 31)) !== Number(d[31])) return false;
  const barras = codigoDeBarrasBancario(d);
  const dv = 11 - (somaMod11(barras.slice(0, 4) + barras.slice(5)) % 11);
  return (dv === 0 || dv >= 10 ? 1 : dv) === Number(barras[4]);
}

// Arrecadação (concessionárias, tributos): 4 blocos de 11 dígitos + DV.
// O 3º dígito diz o módulo: 6/7 = módulo 10, 8/9 = módulo 11.
function linhaArrecadacaoValida(d) {
  if (d[0] !== '8') return false;
  const ref = d[2];
  if (!'6789'.includes(ref)) return false;
  for (let b = 0; b < 4; b++) {
    const bloco = d.slice(b * 12, b * 12 + 11);
    const dv = Number(d[b * 12 + 11]);
    let esperado;
    if (ref === '6' || ref === '7') esperado = mod10(bloco);
    else { const r = somaMod11(bloco) % 11; esperado = r <= 1 ? 0 : 11 - r; }
    if (esperado !== dv) return false;
  }
  return true;
}

export function linhaDigitavelValida(valor) {
  const d = soDigitos(valor);
  if (d.length === 47) return linhaBancariaValida(d);
  if (d.length === 48) return linhaArrecadacaoValida(d);
  return false;
}

const DIA = 86400000;
const isoDe = (ms) => new Date(ms).toISOString().slice(0, 10);

// Fator de vencimento -> data. O fator reiniciou em 1000 em 22/02/2025;
// o mesmo número vale pra duas datas (ciclo antigo e novo) -- fica a mais
// próxima de "hoje".
export function vencimentoDoFator(fator, hoje = new Date()) {
  const f = Number(fator);
  if (!f) return null;
  const antigo = Date.UTC(1997, 9, 7) + f * DIA;
  const novo = Date.UTC(2025, 1, 22) + (f - 1000) * DIA;
  const ref = hoje.getTime();
  return isoDe(Math.abs(novo - ref) <= Math.abs(antigo - ref) ? novo : antigo);
}

// { valor, vencimento } que a própria linha digitável carrega (vencimento
// só no boleto bancário). Valor zero ("boleto sem valor") vira null.
export function dadosDaLinha(valor, hoje) {
  const d = soDigitos(valor);
  if (d.length === 47) {
    const centavos = Number(d.slice(37, 47));
    return { valor: centavos ? centavos / 100 : null, vencimento: vencimentoDoFator(d.slice(33, 37), hoje) };
  }
  if (d.length === 48) {
    const barras = d.slice(0, 11) + d.slice(12, 23) + d.slice(24, 35) + d.slice(36, 47);
    const efetivo = d[2] === '6' || d[2] === '8';
    const centavos = Number(barras.slice(4, 15));
    return { valor: efetivo && centavos ? centavos / 100 : null, vencimento: null };
  }
  return { valor: null, vencimento: null };
}

const UFS = new Set(['11', '12', '13', '14', '15', '16', '17', '21', '22', '23', '24', '25', '26', '27', '28', '29', '31', '32', '33', '35', '41', '42', '43', '50', '51', '52', '53']);

// Chave de acesso: cUF(2) AAMM(4) CNPJ/CPF(14) modelo(2) série(3) nNF(9)
// tpEmis(1) cNF(8) DV(1).
export function chaveNfeValida(valor, hoje = new Date()) {
  const d = soDigitos(valor);
  if (d.length !== 44) return false;
  if (!UFS.has(d.slice(0, 2))) return false;
  const ano = 2000 + Number(d.slice(2, 4)), mes = Number(d.slice(4, 6));
  if (mes < 1 || mes > 12 || ano < 2006 || ano > hoje.getFullYear() + 1) return false;
  if (d.slice(20, 22) !== '55' && d.slice(20, 22) !== '65') return false;
  const dv = 11 - (somaMod11(d.slice(0, 43)) % 11);
  return (dv >= 10 ? 0 : dv) === Number(d[43]);
}

// { cnpjEmitente, numeroNota, serie, mesEmissao ('AAAA-MM') } da chave.
export function dadosDaChave(valor) {
  const d = soDigitos(valor);
  return {
    cnpjEmitente: d.slice(6, 20),
    numeroNota: d.slice(25, 34).replace(/^0+(?=\d)/, ''),
    serie: d.slice(22, 25).replace(/^0+(?=\d)/, ''),
    mesEmissao: `20${d.slice(2, 4)}-${d.slice(4, 6)}`,
  };
}

// 'dd/mm/aaaa' de calendário real, ano a no máximo `anos` do atual.
export function dataPlausivel(br, { anos = 2, hoje = new Date() } = {}) {
  const m = String(br ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const data = new Date(Date.UTC(a, mes - 1, d));
  if (data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== d) return false;
  return Math.abs(a - hoje.getFullYear()) <= anos;
}

// Valor de nota/boleto plausível: positivo e abaixo de um teto (um
// "R$ 1.234.567.890,00" é quase sempre dígito duplicado pelo OCR).
export const VALOR_MAXIMO_PLAUSIVEL = 50_000_000;
export function valorPlausivel(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v < VALOR_MAXIMO_PLAUSIVEL;
}

// Procura, numa sequência de dígitos maior que o esperado (OCR juntou um
// dígito solto antes/depois), a janela de `tamanho` dígitos que passa no
// validador. Devolve a janela ou null.
export function janelaValida(digitos, tamanho, valida) {
  if (digitos.length < tamanho) return null;
  for (let i = 0; i + tamanho <= digitos.length; i++) {
    const janela = digitos.slice(i, i + tamanho);
    if (valida(janela)) return janela;
  }
  return null;
}
