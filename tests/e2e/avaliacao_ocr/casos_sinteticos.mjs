// tests/e2e/avaliacao_ocr/casos_sinteticos.mjs
//
// Casos sintéticos do harness: nota fiscal (DANFE simplificada), boleto e
// comprovante de transferência, com dados 100% fictícios gerados aqui
// (CNPJ/CPF com dígito verificador calculado, chave de acesso e linha
// digitável válidas, razões sociais inventadas) -- nada vem de
// src/data/seed nem do banco. Determinístico: mesma semente, mesmos casos.
//
// Cada caso traz o GABARITO (o que o leitor deveria extrair) e o LAYOUT
// (linhas de texto com posição/tamanho) que gerar_sinteticos.js desenha
// num canvas no navegador, aplicando depois a degradação do caso.
//
// As contas de dígito verificador ficam aqui, escritas a partir das
// regras públicas (Receita Federal / FEBRABAN / Manual da NF-e), de forma
// independente do código do app -- assim, quando a etapa 3 trouxer o
// validador do app, os dois se conferem.

// PRNG pequeno e determinístico (mulberry32).
export function prng(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const digitos = (r, n) => Array.from({ length: n }, () => Math.floor(r() * 10)).join('');
const escolher = (r, lista) => lista[Math.floor(r() * lista.length)];
const pad = (n, t) => String(n).padStart(t, '0');

// --- Dígitos verificadores ------------------------------------------------

export function dvCnpj(base12) {
  const calc = (s, pesos) => {
    const soma = s.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${d1}${d2}`;
}

export function dvCpf(base9) {
  const calc = (s) => {
    const n = s.length + 1;
    const soma = s.split('').reduce((acc, d, i) => acc + Number(d) * (n - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = calc(base9);
  return `${d1}${calc(base9 + d1)}`;
}

// Módulo 11 com pesos 2..9 da direita pra esquerda (soma bruta).
function somaMod11(s) {
  let peso = 2, soma = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    soma += Number(s[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  return soma;
}

// Chave de acesso NF-e: DV = 11 - (soma % 11); 10 ou 11 vira 0.
export function dvChaveNfe(base43) {
  const dv = 11 - (somaMod11(base43) % 11);
  return dv >= 10 ? 0 : dv;
}

// Módulo 10 (campos da linha digitável): pesos 2,1 alternados da direita,
// soma dos algarismos de cada produto.
export function dvMod10(s) {
  let peso = 2, soma = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const p = Number(s[i]) * peso;
    soma += p > 9 ? p - 9 : p;
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

// DV geral do código de barras do boleto bancário: 0, 10 ou 11 viram 1.
export function dvBoleto(codigo43) {
  const dv = 11 - (somaMod11(codigo43) % 11);
  return dv === 0 || dv >= 10 ? 1 : dv;
}

// Fator de vencimento (FEBRABAN): dias desde 07/10/1997, reiniciado em
// 1000 a partir de 22/02/2025.
export function fatorVencimento(dataIso) {
  const dia = 86400000;
  const d = Date.UTC(+dataIso.slice(0, 4), +dataIso.slice(5, 7) - 1, +dataIso.slice(8, 10));
  const reinicio = Date.UTC(2025, 1, 22);
  if (d >= reinicio) return 1000 + Math.round((d - reinicio) / dia);
  return Math.round((d - Date.UTC(1997, 9, 7)) / dia);
}

// --- Geradores de dados ---------------------------------------------------

export function gerarCnpj(r) {
  const base = digitos(r, 8) + '0001';
  const n = base + dvCnpj(base);
  return { digitos: n, formatado: `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}` };
}

export function gerarCpf(r) {
  const base = digitos(r, 9);
  const n = base + dvCpf(base);
  return { digitos: n, formatado: `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}` };
}

// cUF(2) AAMM(4) CNPJ(14) mod(2) série(3) nNF(9) tpEmis(1) cNF(8) DV(1)
export function gerarChaveNfe(r, { cnpj, dataIso, numero, serie = 1 }) {
  const base = `35${dataIso.slice(2, 4)}${dataIso.slice(5, 7)}${cnpj}55${pad(serie, 3)}${pad(numero, 9)}1${digitos(r, 8)}`;
  const chave = base + dvChaveNfe(base);
  return { digitos: chave, formatado: chave.match(/.{4}/g).join(' ') };
}

// Linha digitável do boleto bancário (47 dígitos) a partir do código de
// barras: banco(3) moeda(1) DV(1) fator(4) valor(10) campo livre(25).
export function gerarLinhaDigitavel(r, { banco = '341', vencimentoIso, valor }) {
  const livre = digitos(r, 25);
  const fator = pad(fatorVencimento(vencimentoIso), 4);
  const valorStr = pad(Math.round(valor * 100), 10);
  const sem = `${banco}9${fator}${valorStr}${livre}`;
  const dv = dvBoleto(sem);
  const c1 = `${banco}9${livre.slice(0, 5)}`;
  const c2 = livre.slice(5, 15);
  const c3 = livre.slice(15, 25);
  const campo1 = c1 + dvMod10(c1), campo2 = c2 + dvMod10(c2), campo3 = c3 + dvMod10(c3);
  const linha = `${campo1}${campo2}${campo3}${dv}${fator}${valorStr}`;
  const formatado = `${campo1.slice(0, 5)}.${campo1.slice(5)} ${campo2.slice(0, 5)}.${campo2.slice(5)} ${campo3.slice(0, 5)}.${campo3.slice(5)} ${dv} ${fator}${valorStr}`;
  return { digitos: linha, formatado, codigoBarras: `${banco}9${dv}${fator}${valorStr}${livre}` };
}

const NOMES = ['Alfa Serviços Gerais', 'Beta Manutenção Predial', 'Gama Limpeza e Conservação', 'Delta Elevadores', 'Ômega Segurança Patrimonial', 'Sigma Climatização', 'Zeta Jardinagem', 'Kappa Tecnologia'];
const SUFIXOS = ['Ltda', 'Eireli', 'S.A.', 'ME'];
const PAGADOR = 'Condomínio Centro Comercial Exemplo';

function gerarData(r, ano = 2026) {
  const mes = 1 + Math.floor(r() * 9);
  const dia = 1 + Math.floor(r() * 27);
  return `${ano}-${pad(mes, 2)}-${pad(dia, 2)}`;
}
const br = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const somarDias = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const brl = (v) => v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

function gerarValor(r) {
  return Math.round((150 + r() * r() * 48000) * 100) / 100;
}

// --- Layouts --------------------------------------------------------------
// Coordenadas em px numa página de 1100 x 1400 (≈ A4 a 130 dpi). Cada
// linha: { x, y, t (texto), s (tamanho da fonte), b (negrito) }.

function layoutNota(r) {
  const emitente = `${escolher(r, NOMES)} ${escolher(r, SUFIXOS)}`;
  const cnpj = gerarCnpj(r);
  const pagadorCnpj = gerarCnpj(r);
  const emissao = gerarData(r);
  const numero = 1000 + Math.floor(r() * 899000);
  const numeroFmt = pad(numero, 9).replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3');
  const chave = gerarChaveNfe(r, { cnpj: cnpj.digitos, dataIso: emissao, numero });
  const itens = Array.from({ length: 2 + Math.floor(r() * 3) }, (_, i) => ({ desc: escolher(r, ['Serviço de manutenção', 'Material de consumo', 'Mão de obra especializada', 'Peças de reposição', 'Visita técnica']), qtd: 1 + Math.floor(r() * 5), unit: Math.round((50 + r() * 4000) * 100) / 100, i }));
  const total = Math.round(itens.reduce((s, it) => s + it.qtd * it.unit, 0) * 100) / 100;
  const L = [
    { x: 60, y: 70, t: 'DANFE', s: 34, b: true },
    { x: 60, y: 105, t: 'Documento Auxiliar da Nota Fiscal Eletrônica', s: 20 },
    { x: 700, y: 70, t: `Nº ${numeroFmt}`, s: 26, b: true },
    { x: 700, y: 105, t: 'Série 001   Folha 1/1', s: 20 },
    { x: 60, y: 170, t: emitente.toUpperCase(), s: 24, b: true },
    { x: 60, y: 205, t: `CNPJ: ${cnpj.formatado}   IE: ${digitos(r, 12)}`, s: 20 },
    { x: 60, y: 235, t: `Rua ${escolher(r, ['das Flores', 'XV de Novembro', 'Sete de Setembro'])}, ${10 + Math.floor(r() * 900)} - Centro`, s: 20 },
    { x: 60, y: 300, t: 'CHAVE DE ACESSO', s: 18, b: true },
    { x: 60, y: 335, t: chave.formatado, s: 22 },
    { x: 60, y: 400, t: `DATA DA EMISSÃO: ${br(emissao)}`, s: 20 },
    { x: 560, y: 400, t: `DATA DA SAÍDA: ${br(somarDias(emissao, 1))}`, s: 20 },
    { x: 60, y: 460, t: 'DESTINATÁRIO', s: 18, b: true },
    { x: 60, y: 492, t: PAGADOR.toUpperCase(), s: 20 },
    { x: 60, y: 522, t: `CNPJ: ${pagadorCnpj.formatado}`, s: 20 },
    { x: 60, y: 590, t: 'DESCRIÇÃO DO PRODUTO / SERVIÇO        QTD     VL. UNIT.      VL. TOTAL', s: 18, b: true },
    ...itens.map((it, k) => ({ x: 60, y: 625 + k * 32, t: `${pad(k + 1, 2)} ${it.desc.padEnd(34, ' ')} ${String(it.qtd).padStart(3, ' ')}   ${brl(it.unit).padStart(10, ' ')}   ${brl(it.qtd * it.unit).padStart(11, ' ')}`, s: 18 })),
    { x: 60, y: 820, t: `BASE DE CÁLCULO DO ISS: ${brl(total)}     ALÍQUOTA: 5%     VALOR DO ISS: ${brl(total * 0.05)}`, s: 18 },
    { x: 560, y: 890, t: `VALOR TOTAL DA NOTA R$ ${brl(total)}`, s: 24, b: true },
    { x: 60, y: 980, t: 'INFORMAÇÕES COMPLEMENTARES', s: 18, b: true },
    { x: 60, y: 1012, t: `Pedido ${digitos(r, 6)} - Competência ${br(emissao).slice(3)}`, s: 18 },
  ];
  return {
    tipo: 'nota_fiscal',
    gabarito: { numeroNota: String(numero), valor: total, documento: cnpj.digitos, data: emissao, chaveAcesso: chave.digitos },
    linhas: L,
  };
}

function layoutBoleto(r) {
  const beneficiario = `${escolher(r, NOMES)} ${escolher(r, SUFIXOS)}`;
  const cnpj = gerarCnpj(r);
  const pagadorCnpj = gerarCnpj(r);
  const documento = gerarData(r);
  const vencimento = somarDias(documento, 10 + Math.floor(r() * 20));
  const valor = gerarValor(r);
  const linha = gerarLinhaDigitavel(r, { vencimentoIso: vencimento, valor });
  const L = [
    { x: 60, y: 70, t: 'Banco Exemplo S.A. | 341-7 |', s: 26, b: true },
    { x: 420, y: 70, t: linha.formatado, s: 18, b: true },
    { x: 60, y: 140, t: 'Local de pagamento', s: 16 },
    { x: 60, y: 168, t: 'Pagável em qualquer banco até o vencimento', s: 20 },
    { x: 800, y: 140, t: 'Vencimento', s: 16 },
    { x: 800, y: 168, t: br(vencimento), s: 22, b: true },
    { x: 60, y: 220, t: 'Beneficiário', s: 16 },
    { x: 60, y: 248, t: `${beneficiario.toUpperCase()} - CNPJ ${cnpj.formatado}`, s: 20 },
    { x: 800, y: 220, t: 'Agência/Código beneficiário', s: 16 },
    { x: 800, y: 248, t: `${digitos(r, 4)} / ${digitos(r, 5)}-${digitos(r, 1)}`, s: 20 },
    { x: 60, y: 300, t: 'Data do documento', s: 16 },
    { x: 60, y: 328, t: br(documento), s: 20 },
    { x: 280, y: 300, t: 'Nº do documento', s: 16 },
    { x: 280, y: 328, t: digitos(r, 7), s: 20 },
    { x: 520, y: 300, t: 'Espécie doc.  Aceite', s: 16 },
    { x: 520, y: 328, t: 'DM            N', s: 20 },
    { x: 800, y: 300, t: 'Nosso número', s: 16 },
    { x: 800, y: 328, t: `109/${digitos(r, 8)}-${digitos(r, 1)}`, s: 20 },
    { x: 800, y: 380, t: '(=) Valor do documento', s: 16 },
    { x: 800, y: 410, t: `R$ ${brl(valor)}`, s: 24, b: true },
    { x: 60, y: 380, t: 'Instruções (texto de responsabilidade do beneficiário)', s: 16 },
    { x: 60, y: 410, t: 'Após o vencimento cobrar multa de 2% e juros de 1% ao mês.', s: 18 },
    { x: 60, y: 440, t: 'Não receber após 30 dias do vencimento.', s: 18 },
    { x: 800, y: 460, t: '(-) Desconto / Abatimento', s: 16 },
    { x: 800, y: 520, t: '(+) Mora / Multa', s: 16 },
    { x: 60, y: 600, t: 'Pagador', s: 16 },
    { x: 60, y: 628, t: `${PAGADOR.toUpperCase()} - CNPJ ${pagadorCnpj.formatado}`, s: 20 },
    { x: 60, y: 700, t: 'Ficha de Compensação', s: 18, b: true },
    { x: 60, y: 740, barras: linha.codigoBarras },
  ];
  return {
    tipo: 'boleto',
    gabarito: { valor, documento: cnpj.digitos, data: vencimento, linhaDigitavel: linha.digitos },
    linhas: L,
  };
}

function layoutComprovante(r) {
  const destino = `${escolher(r, NOMES)} ${escolher(r, SUFIXOS)}`;
  const pessoaFisica = r() < 0.3;
  const doc = pessoaFisica ? gerarCpf(r) : gerarCnpj(r);
  const origemCnpj = gerarCnpj(r);
  const data = gerarData(r);
  const valor = gerarValor(r);
  const pix = r() < 0.6;
  const hora = `${pad(8 + Math.floor(r() * 10), 2)}:${pad(Math.floor(r() * 60), 2)}`;
  const L = [
    { x: 60, y: 80, t: pix ? 'Comprovante de transferência PIX' : 'Comprovante de transferência TED', s: 30, b: true },
    { x: 60, y: 125, t: `${br(data)} às ${hora}`, s: 20 },
    { x: 60, y: 200, t: 'Valor', s: 18 },
    { x: 60, y: 240, t: `R$ ${brl(valor)}`, s: 34, b: true },
    { x: 60, y: 320, t: 'Destino', s: 22, b: true },
    { x: 60, y: 355, t: `Nome: ${pessoaFisica ? 'Fulano de Tal da Silva' : destino}`, s: 20 },
    { x: 60, y: 385, t: `${pessoaFisica ? 'CPF' : 'CNPJ'}: ${doc.formatado}`, s: 20 },
    { x: 60, y: 415, t: `Instituição: ${escolher(r, ['Banco Um', 'Banco Dois', 'Cooperativa Três'])}`, s: 20 },
    { x: 60, y: 445, t: pix ? `Chave: ${escolher(r, ['e-mail', 'telefone', 'aleatória'])}` : `Agência ${digitos(r, 4)} Conta ${digitos(r, 6)}-${digitos(r, 1)}`, s: 20 },
    { x: 60, y: 520, t: 'Origem', s: 22, b: true },
    { x: 60, y: 555, t: `Nome: ${PAGADOR}`, s: 20 },
    { x: 60, y: 585, t: `CNPJ: ${origemCnpj.formatado}`, s: 20 },
    { x: 60, y: 660, t: `ID da transação: E${digitos(r, 8)}${digitos(r, 12)}${digitos(r, 10)}`, s: 18 },
    { x: 60, y: 690, t: `Autenticação: ${digitos(r, 4)}.${digitos(r, 4)}.${digitos(r, 4)}`, s: 18 },
  ];
  return {
    tipo: 'comprovante_pagamento',
    gabarito: { valor, documento: doc.digitos, data },
    linhas: L,
  };
}

// Degradações (aplicadas em gerar_sinteticos.js, no navegador). Cada uma
// leva parâmetros sorteados pela mesma semente do caso.
export const DEGRADACOES = ['limpo', 'ruido', 'contraste', 'inclinacao', 'rot90', 'rot180', 'rot270', 'baixa_res', 'desfoque', 'foto_celular'];

function parametrosDegradacao(r, nome) {
  const sinal = r() < 0.5 ? -1 : 1;
  switch (nome) {
    case 'ruido': return { ruido: 28 + r() * 20, salPimenta: 0.004 + r() * 0.006 };
    case 'contraste': return { fundo: 150 + Math.floor(r() * 40), tinta: 90 + Math.floor(r() * 30) };
    case 'inclinacao': return { angulo: sinal * (2 + r() * 5) };
    case 'rot90': return { rotacao: 90 };
    case 'rot180': return { rotacao: 180 };
    case 'rot270': return { rotacao: 270 };
    case 'baixa_res': return { escala: 0.45 + r() * 0.15 };
    case 'desfoque': return { desfoque: 1.2 + r() * 0.8 };
    case 'foto_celular': return { angulo: sinal * (1 + r() * 3), ruido: 18 + r() * 10, escala: 0.6 + r() * 0.1, fundo: 215 + Math.floor(r() * 25), tinta: 40, gradiente: true };
    default: return {};
  }
}

const LAYOUTS = { nota_fiscal: layoutNota, boleto: layoutBoleto, comprovante_pagamento: layoutComprovante };

// Lista completa de casos: tipos x degradações x sementes. A semente de
// cada caso é derivada do índice, pra que adicionar uma degradação nova
// no fim da lista não mude os casos que já existiam.
export function gerarCasos({ sementes = 2, tipos = Object.keys(LAYOUTS), degradacoes = DEGRADACOES } = {}) {
  const casos = [];
  for (let s = 0; s < sementes; s++) {
    tipos.forEach((tipo, it) => {
      degradacoes.forEach((deg) => {
        const semente = 1000 * (s + 1) + 37 * (it + 1) + DEGRADACOES.indexOf(deg) * 7919;
        const r = prng(semente);
        const doc = LAYOUTS[tipo](r);
        casos.push({
          id: `${tipo}-${deg}-s${s + 1}`,
          semente,
          tipo,
          degradacao: deg,
          gabarito: doc.gabarito,
          pagina: { largura: 1100, altura: 1400, linhas: doc.linhas },
          efeitos: { ...parametrosDegradacao(r, deg), semente },
        });
      });
    });
  }
  return casos;
}
