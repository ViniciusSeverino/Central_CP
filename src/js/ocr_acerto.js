// src/js/ocr_acerto.js
//
// Régua de acerto do leitor de documentos (leitor_documentos.js): compara
// os campos que ele extraiu com o gabarito (o que foi LANÇADO na nota, ou
// o gabarito de um caso de teste) e agrega em taxas por campo. Puro (sem
// DOM, sem rede). Uma régua só pra tudo: o painel de acerto da aba
// Treinamento (ui_treinamento.js) e o harness de avaliação
// (tests/e2e/avaliacao_ocr/, que reexporta daqui).
//
// Cada campo de cada caso vira um de três desfechos:
//   'acerto'  -- o leitor preencheu e bate com o gabarito
//   'erro'    -- o leitor preencheu com um valor ERRADO (erro silencioso:
//                o pior caso pra "OCR é sugestão", porque parece certo)
//   'ausente' -- o leitor não preencheu o campo
// Campo sem gabarito no caso não é pontuado (não entra no denominador).

export const CAMPOS = ['numeroNota', 'valor', 'documento', 'data', 'dataEmissao', 'vencimento', 'linhaDigitavel', 'chaveAcesso'];

export const ROTULO_CAMPO = {
  numeroNota: 'Número da nota', valor: 'Valor', documento: 'CNPJ/CPF', data: 'Data',
  dataEmissao: 'Data de emissão', vencimento: 'Vencimento',
  linhaDigitavel: 'Linha digitável', chaveAcesso: 'Chave NF-e',
};

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');
const semZerosEsquerda = (v) => soDigitos(v).replace(/^0+(?=\d)/, '');

// Data em qualquer formato que aparece aqui ('dd/mm/aaaa' do leitor,
// 'aaaa-mm-dd' do banco) -> 'aaaa-mm-dd'. Inválida -> ''.
export function normalizarData(v) {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return '';
}

// Valor normalizado de um campo, pra comparar. null = vazio.
export function normalizar(campo, v) {
  if (v === null || v === undefined || v === '') return null;
  switch (campo) {
    case 'numeroNota': { const d = semZerosEsquerda(v); return d || null; }
    case 'valor': { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }
    case 'data': case 'dataEmissao': case 'vencimento': return normalizarData(v) || null;
    default: { const d = soDigitos(v); return d || null; }
  }
}

function iguais(campo, a, b) {
  if (a === null || b === null) return false;
  if (campo === 'valor') return Math.abs(a - b) < 0.005;
  return a === b;
}

// O que o leitor devolveu (objeto `campos` de extrairCampos) no formato
// dos CAMPOS da régua -- documento junta cnpj/cpf (o gabarito sabe só "o
// documento do fornecedor", que pode ser um ou outro).
export function camposDoLeitor(campos) {
  const c = campos || {};
  return {
    numeroNota: c.numeroNota, valor: c.valor, documento: c.cnpj || c.cpf, data: c.data,
    dataEmissao: c.dataEmissao, vencimento: c.vencimento,
    linhaDigitavel: c.linhaDigitavel, chaveAcesso: c.chaveAcesso,
  };
}

// Campos que o leitor marcou como duvidosos (camposDuvidosos de
// leitor_documentos.js) no vocabulário da régua -- documento = cnpj/cpf.
export function duvidososDoLeitor(camposDuvidosos) {
  const lista = camposDuvidosos || [];
  const out = {};
  for (const c of CAMPOS) {
    out[c] = c === 'documento' ? (lista.includes('cnpj') || lista.includes('cpf')) : lista.includes(c);
  }
  return out;
}

// gabarito: { [campo]: valor | valor[] } -- uma lista aceita qualquer um
// dos valores (ex: valor bruto OU líquido; emissão OU vencimento).
export function pontuarCaso(gabarito, campos) {
  const obtidos = camposDoLeitor(campos);
  const out = {};
  for (const campo of CAMPOS) {
    const esperado = gabarito[campo];
    if (esperado === undefined || esperado === null || (Array.isArray(esperado) && !esperado.length)) continue;
    const aceitos = (Array.isArray(esperado) ? esperado : [esperado]).map(e => normalizar(campo, e)).filter(e => e !== null);
    if (!aceitos.length) continue;
    const obtido = normalizar(campo, obtidos[campo]);
    out[campo] = obtido === null ? 'ausente' : (aceitos.some(e => iguais(campo, obtido, e)) ? 'acerto' : 'erro');
  }
  return out;
}

// O valor esperado aparece em algum lugar do texto reconhecido? Separa
// "o OCR não leu" (não aparece) de "leu, mas o leitor escolheu outro
// valor" (aparece, mas o campo deu erro/ausente) -- é o que diz se o
// ganho vem de melhorar o reconhecimento (etapas 1/4) ou a escolha
// (etapa 3). Comparação só por dígitos (ignora pontuação/espaços que o
// OCR costuma trocar).
export function apareceNoTexto(campo, esperado, texto) {
  const digitosTexto = soDigitos(texto);
  const aceitos = Array.isArray(esperado) ? esperado : [esperado];
  return aceitos.some((e) => {
    if (e === null || e === undefined || e === '') return false;
    let alvo;
    if (campo === 'valor') alvo = soDigitos(Number(e).toFixed(2));
    else if (campo === 'data' || campo === 'dataEmissao' || campo === 'vencimento') { const d = normalizarData(e); alvo = d ? d.slice(8, 10) + d.slice(5, 7) + d.slice(0, 4) : ''; }
    else if (campo === 'numeroNota') alvo = semZerosEsquerda(e);
    else alvo = soDigitos(e);
    return !!alvo && digitosTexto.includes(alvo);
  });
}

// casos: [{ id, grupos: { tipo, degradacao, ... }, pontos: {campo: desfecho},
// noTexto?: {campo: bool}, duvidosos?: {campo: bool}, ms? }]. Devolve
// totais por campo, e os mesmos totais por cada valor de cada chave de
// `grupos`. "Sinalizado" = o leitor marcou o campo pra conferir: erro
// sinalizado é aceitável (a pessoa é avisada); o que importa derrubar é o
// erro NÃO sinalizado.
export function agregar(casos) {
  const novo = () => Object.fromEntries(CAMPOS.map(c => [c, { casos: 0, acerto: 0, erro: 0, ausente: 0, noTexto: 0, acertoSinalizado: 0, erroSinalizado: 0 }]));
  const somar = (alvo, caso) => {
    for (const [campo, desfecho] of Object.entries(caso.pontos)) {
      const t = alvo[campo];
      t.casos++; t[desfecho]++;
      if (caso.noTexto && caso.noTexto[campo]) t.noTexto++;
      if (caso.duvidosos && caso.duvidosos[campo] && desfecho !== 'ausente') t[desfecho + 'Sinalizado']++;
    }
  };
  const total = novo();
  const porGrupo = {};
  for (const caso of casos) {
    somar(total, caso);
    for (const [chave, valor] of Object.entries(caso.grupos || {})) {
      porGrupo[chave] ||= {};
      porGrupo[chave][valor] ||= novo();
      somar(porGrupo[chave][valor], caso);
    }
  }
  const tempos = casos.map(c => c.ms).filter(Number.isFinite);
  return {
    casos: casos.length,
    msMedio: tempos.length ? Math.round(tempos.reduce((s, t) => s + t, 0) / tempos.length) : null,
    total, porGrupo,
  };
}

export const taxa = (t, chave = 'acerto') => (t && t.casos ? t[chave] / t.casos : null);
const VAZIO = { casos: 0, acerto: 0, erro: 0, ausente: 0, noTexto: 0, acertoSinalizado: 0, erroSinalizado: 0 };
export const totalDe = (agregado, campo) => (agregado.total && agregado.total[campo]) || VAZIO;
export const erroNaoSinalizado = (t) => (t && t.casos ? (t.erro - (t.erroSinalizado || 0)) / t.casos : null);
export const sinalizado = (t) => (t && t.casos ? ((t.acertoSinalizado || 0) + (t.erroSinalizado || 0)) / t.casos : null);


// Gabarito de uma nota já lançada (o que a pessoa conferiu e lançou): o
// que o leitor deveria ter achado no anexo dela. Valor: bruto OU líquido
// (o anexo pode ser o boleto do líquido). O vencimento lançado NÃO entra:
// é a data de pagamento (regra de vencimento comum), não a do documento.
export function gabaritoDaNota(nota, fornecedor) {
  return {
    numeroNota: nota.numero_nota || null,
    valor: [nota.valor_bruto, nota.valor_liquido].filter(v => v != null && Number(v) > 0).map(Number),
    documento: (fornecedor && fornecedor.cnpj) || null,
    dataEmissao: nota.data_emissao || null,
  };
}

// Campo do leitor/das dicas (numeroNota, valor, cnpj, cpf, dataEmissao...)
// -> campo da régua (cnpj/cpf viram "documento").
export const campoDaRegua = (campo) => (campo === 'cnpj' || campo === 'cpf' ? 'documento' : campo);

// O valor obtido confere com o esperado (mesma normalização da régua)?
// null quando não há o que comparar (sem gabarito ou sem valor).
export function confere(campo, obtido, esperado) {
  const c = campoDaRegua(campo);
  const r = pontuarCaso({ [c]: esperado }, c === 'documento' ? { cnpj: obtido } : { [c]: obtido })[c];
  return r === 'acerto' ? true : r === 'erro' ? false : null;
}
