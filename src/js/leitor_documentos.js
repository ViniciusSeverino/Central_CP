// src/js/leitor_documentos.js
//
// Orquestra a leitura de um anexo (documento WE9 -- "auditoria do que a
// pessoa preencheu e quais documentos anexou"): extrai o texto (PDF
// digital via pdf_texto.js, ou OCR via ocr_imagem.js pra imagem/scan),
// classifica que TIPO de documento parece ser (nota fiscal, boleto,
// comprovante de pagamento, contrato, guia de imposto) e tenta puxar os
// campos que a gente compara com o formulário (número da NF, valor,
// CNPJ/CPF, data). Tudo heurística de palavra-chave/regex -- avisa,
// nunca decide sozinho: quem confirma ou descarta é sempre a pessoa.
//
// hints (opcional, em analisarAnexo/extrairCampos/reclassificarComHints):
// dicas aprendidas por fornecedor (painel "ensinar o leitor", ver
// aprendizado_extracao.js) -- têm prioridade sobre a regex genérica,
// porque foram confirmadas por alguém pra ESSE fornecedor especificamente.
// Um hint pode ter posição (retângulo desenhado sobre a pré-visualização,
// ver extracao_posicional.js) e/ou âncora de texto -- posição é tentada
// primeiro (mais direta, quando o layout bateu certinho), âncora de texto
// é o plano B pros campos que a posição não resolveu.
import { aplicarHints } from './aprendizado_extracao.js';
import { aplicarHintsDePosicao } from './extracao_posicional.js';
import {
  soDigitos, corrigirConfusoes, cnpjValido, cpfValido, formatarCnpj, formatarCpf,
  linhaDigitavelValida, dadosDaLinha, chaveNfeValida, dadosDaChave, dataPlausivel, valorPlausivel, janelaValida,
} from './validacao_campos.js';
import { agruparEmLinhas, valorAbaixoDoRotulo } from './layout_ocr.js';
const PALAVRAS_CHAVE_POR_TIPO = {
  nota_fiscal: ['nota fiscal', 'nf-e', 'nfe', 'danfe', 'cupom fiscal', 'nfse', 'nfs-e', 'documento auxiliar'],
  boleto: ['boleto', 'ficha de compensação', 'linha digitável', 'cedente', 'sacado', 'código de barras'],
  comprovante_pagamento: ['comprovante de pagamento', 'comprovante de transferência', 'ted realizada', 'pix realizado', 'comprovante ted', 'comprovante pix'],
  contrato: ['contrato', 'cláusula', 'contratante', 'contratada', 'vigência do contrato'],
  guia_imposto: ['darf', 'gps', 'guia de recolhimento', 'darj', 'gare', 'documento de arrecadação'],
};

export const TIPO_DOCUMENTO_LABEL = {
  nota_fiscal: 'Nota fiscal', boleto: 'Boleto', comprovante_pagamento: 'Comprovante de pagamento',
  contrato: 'Contrato', guia_imposto: 'Guia de imposto', nao_identificado: 'Não identificado',
};

// Conta ocorrências de cada grupo de palavras-chave no texto (já em
// minúsculo) e escolhe o tipo com mais acertos -- empate ou zero acertos
// vira "não identificado" (não força um chute).
export function classificarTipoDocumento(texto) {
  const alvo = (texto || '').toLowerCase();
  if (!alvo.trim()) return 'nao_identificado';
  let melhorTipo = 'nao_identificado', melhorPontuacao = 0;
  for (const [tipo, palavras] of Object.entries(PALAVRAS_CHAVE_POR_TIPO)) {
    const pontuacao = palavras.reduce((s, p) => s + (alvo.includes(p) ? 1 : 0), 0);
    if (pontuacao > melhorPontuacao) { melhorPontuacao = pontuacao; melhorTipo = tipo; }
  }
  return melhorTipo;
}

function paraNumeroBr(strBr) {
  const limpo = strBr.includes(',') ? strBr.replace(/\./g, '').replace(',', '.') : strBr;
  const n = parseFloat(limpo);
  return Number.isNaN(n) ? null : n;
}

// Dígito, ou letra que o OCR costuma trocar por dígito (ver
// corrigirConfusoes em validacao_campos.js).
const C = '[0-9OolI|SsB]';
const RE_CNPJ = new RegExp(`(?<![0-9A-Za-z])${C}{2}[.,]?${C}{3}[.,]?${C}{3}\\s?/?\\s?${C}{4}\\s?[-–]?\\s?${C}{2}(?![0-9])`, 'g');
const RE_CPF = new RegExp(`(?<![0-9A-Za-z])${C}{3}\\.${C}{3}\\.${C}{3}\\s?[-–]\\s?${C}{2}(?![0-9])`, 'g');
const RE_CNPJ_ESTRITO = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;
const RE_CPF_ESTRITO = /\d{3}\.\d{3}\.\d{3}-\d{2}/;
const contaDigitos = (s) => (s.match(/\d/g) || []).length;

// Rótulo mais próximo ANTES do documento (até ~120 caracteres, pode ser a
// linha de cima): quem recebe o pagamento (+1) ou quem paga (-1). É o que
// separa o CNPJ do fornecedor do CNPJ do próprio shopping, que aparece no
// mesmo documento como destinatário / pagador / origem.
const ROTULO_FAVOR = /emitente|prestador|benefici[aá]rio|cedente|favorecido|\bdestino\b|recebedor|fornecedor/g;
const ROTULO_CONTRA = /destinat[aá]rio|tomador|\bpagador\b|sacado|\borigem\b|remetente/g;
function pontuarRotulo(texto, indice) {
  const janela = texto.slice(Math.max(0, indice - 120), indice).toLowerCase();
  const ultimo = (re) => { let m, pos = -1; re.lastIndex = 0; while ((m = re.exec(janela))) pos = m.index; return pos; };
  const favor = ultimo(ROTULO_FAVOR), contra = ultimo(ROTULO_CONTRA);
  if (favor < 0 && contra < 0) return 0;
  return favor > contra ? 1 : -1;
}

// Todos os CNPJs/CPFs do texto que passam no dígito verificador (com as
// confusões de OCR desfeitas), melhor primeiro: rótulo de quem recebe,
// depois ordem de aparição. Exige pontuação (todo CNPJ/CPF impresso vem
// formatado) pra não pescar 14 dígitos no meio de uma linha digitável.
function documentosValidos(texto) {
  const achados = [];
  const coletar = (re, tipo, valida, minimo) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(texto))) {
      const bruto = m[0];
      if (contaDigitos(bruto) < minimo || (bruto.match(/[./-]/g) || []).length < 2) continue;
      const digitos = soDigitos(corrigirConfusoes(bruto));
      if (!valida(digitos) || achados.some(a => a.digitos === digitos)) continue;
      achados.push({ tipo, digitos, indice: m.index, pontos: pontuarRotulo(texto, m.index) });
    }
  };
  coletar(RE_CNPJ, 'cnpj', cnpjValido, 10);
  coletar(RE_CPF, 'cpf', cpfValido, 8);
  return achados.sort((a, b) => b.pontos - a.pontos || a.indice - b.indice);
}

// Sequências longas de dígitos (linha digitável, chave de acesso), na
// mesma linha do texto, com espaços/pontos no meio e confusões desfeitas.
function sequenciasLongas(texto) {
  const re = new RegExp(`${C}[0-9OolI|SsB. ]{38,90}${C}`, 'g');
  return (texto.match(re) || []).filter(s => contaDigitos(s) >= 38).map(s => soDigitos(corrigirConfusoes(s)));
}

// Número da NF: grupos de 3 com ponto -- ou vírgula/dois-pontos, que o
// OCR troca -- sem nada numérico logo depois (senão é o começo de um CNPJ
// "73.258.643/0001-.."), ou dígitos com ./- (filtrados em numeroDaNota).
const NUMERO = '(\\d{1,3}(?:[.,:]\\d{3})+(?![\\d/.,:])|\\d[\\d.\\-/]{2,})';
const RE_NUMERO_NOTA = new RegExp(`(?:nota fiscal|nf-?e|danfe)\\D{0,20}?${NUMERO}`, 'gi');
const RE_NUMERO_N = new RegExp(`N[º°o]\\.{0,2}\\s*[:\\-]?\\s*${NUMERO}`, 'g');
// Primeiro candidato com cara de número de nota (até 10 dígitos -- o nNF
// tem no máximo 9; mais que isso é CNPJ, chave ou data).
function numeroDaNota(texto) {
  for (const re of [RE_NUMERO_NOTA, RE_NUMERO_N]) {
    for (const m of texto.matchAll(re)) {
      const limpo = m[1].replace(/[.,:\-\/]/g, '');
      if (limpo && limpo.length <= 10 && !/\d{2}\/\d{2}\/\d{4}/.test(m[1])) return limpo;
    }
  }
  return null;
}
const VALOR = '(\\d{1,3}(?:\\.\\d{3})*,\\d{2}|\\d+[.,]\\d{2})';
const RE_VALOR_ROTULADO = new RegExp(`(?:valor\\s+total(?:\\s+da\\s+nota)?|total\\s+da\\s+nota|valor\\s+do\\s+documento|valor\\s+a\\s+pagar|valor\\s+cobrado|total\\s+a\\s+pagar)[^\\d]{0,30}?(?:R\\$\\s*)?${VALOR}`, 'i');
const RE_VALOR_RS = new RegExp(`R\\$\\s*${VALOR}`);
const semZeros = (d) => String(d || '').replace(/^0+(?=\d)/, '');
const isoParaBr = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const brParaMes = (br) => `${br.slice(6, 10)}-${br.slice(3, 5)}`;

// Tipo de cada página (nota fiscal, boleto, comprovante...), pelo texto
// dela -- é o que deixa uma dica de posição achar a página certa num PDF
// que junta vários documentos em ordem que muda de nota pra nota (ver
// aplicarHintsDePosicao em extracao_posicional.js).
export function tiposDasPaginas(palavrasPorPagina) {
  if (!palavrasPorPagina) return undefined;
  const tipos = {};
  for (const [pagina, palavras] of Object.entries(palavrasPorPagina)) {
    tipos[pagina] = classificarTipoDocumento((palavras || []).map(p => p.texto).join(' '));
  }
  return tipos;
}

// O valor que uma dica de posição achou faz sentido pro campo? (dígito
// verificador de CNPJ/CPF, data de calendário plausível, valor positivo,
// número de nota com cara de número de nota.)
export function valorValidoParaCampo(campo, valor) {
  switch (campo) {
    case 'cnpj': return cnpjValido(valor);
    case 'cpf': return cpfValido(valor);
    case 'data': case 'dataEmissao': case 'vencimento': return dataPlausivel(valor);
    case 'valor': return valorPlausivel(valor);
    case 'numeroNota': { const d = soDigitos(valor); return d.length >= 1 && d.length <= 10; }
    default: return true;
  }
}

// Extração com os detalhes da validação: { campos, validados[],
// invalidos { campo: motivo }, documentosCandidatos[] }.
//   validados  -- campos confirmados por dígito verificador (CNPJ/CPF,
//                 linha digitável, chave de acesso) ou tirados de uma linha
//                 digitável / chave válida: dá pra preencher sem "confira".
//   invalidos  -- campos que existem mas não passaram na validação (DV que
//                 não confere, data fora do mês da chave): ficam como
//                 duvidosos.
//   documentosCandidatos -- todos os CNPJs/CPFs válidos (dígitos), melhor
//                 primeiro -- a detecção de fornecedor tenta um por um.
// Regex heurísticas: documentos reais variam muito de layout, então isso
// acerta o caso comum (padrão brasileiro), não é um parser garantido pra
// qualquer formato. hints (dicas aprendidas pro fornecedor) têm a palavra
// final -- posição (extracao_posicional.js) por cima de âncora
// (aprendizado_extracao.js) por cima da escolha genérica.
export function extrairCamposDetalhado(texto, hints, palavrasPorPagina) {
  const campos = {};
  const validados = new Set();
  const invalidos = {};
  if (!texto) return { campos, validados: [], invalidos, documentosCandidatos: [] };

  const numero = numeroDaNota(texto);
  if (numero) campos.numeroNota = numero;

  const mValor = texto.match(RE_VALOR_ROTULADO) || texto.match(RE_VALOR_RS);
  if (mValor) {
    const v = paraNumeroBr(mValor[1]);
    if (v !== null && valorPlausivel(v)) campos.valor = v;
  }

  // CNPJ/CPF: o melhor que passa no dígito verificador. Sem nenhum válido,
  // fica o primeiro no formato certo (como sempre foi) -- mas marcado:
  // provavelmente o OCR trocou algum dígito.
  const candidatos = documentosValidos(texto);
  if (candidatos.length) {
    const melhor = candidatos[0];
    campos[melhor.tipo] = melhor.tipo === 'cnpj' ? formatarCnpj(melhor.digitos) : formatarCpf(melhor.digitos);
    validados.add(melhor.tipo);
  } else {
    const mCnpj = texto.match(RE_CNPJ_ESTRITO);
    const mCpf = !mCnpj && texto.match(RE_CPF_ESTRITO);
    if (mCnpj) { campos.cnpj = mCnpj[0]; invalidos.cnpj = 'dígito verificador não confere'; }
    else if (mCpf) { campos.cpf = mCpf[0]; invalidos.cpf = 'dígito verificador não confere'; }
  }

  const datas = texto.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
  const primeiraData = datas.find(d => dataPlausivel(d)) || datas[0];
  if (primeiraData) campos.data = primeiraData;
  // Datas com rótulo, separadas -- `data` (a primeira do texto) continua
  // existindo pra quem já usa, mas pro formulário importa saber QUAL data
  // é: emissão (nota fiscal) ou vencimento (boleto). O rótulo pode estar
  // na linha de cima (layout de formulário), por isso aceita quebra de
  // linha entre ele e a data -- mas nenhum dígito no meio (senão "após o
  // vencimento cobrar 2%" pegaria a próxima data que aparecesse).
  const mEmissao = texto.match(/(?:data\s*(?:de|da)?\s*emiss[aã]o|emitid[ao]\s*em|emiss[aã]o)[^\d]{0,40}(\d{2}\/\d{2}\/\d{4})/i);
  if (mEmissao && dataPlausivel(mEmissao[1])) campos.dataEmissao = mEmissao[1];
  const mVencimento = texto.match(/vencimento[^\d]{0,40}(\d{2}\/\d{2}\/\d{4})/i);
  if (mVencimento && dataPlausivel(mVencimento[1])) campos.vencimento = mVencimento[1];

  // Layout de formulário: rótulo numa linha e o valor na de baixo, na
  // mesma coluna (só quando há palavras posicionadas -- OCR ou seleção em
  // PDF). Plano B pro que a regex no texto corrido não achou.
  if (palavrasPorPagina && (!campos.vencimento || !campos.dataEmissao || campos.valor == null)) {
    const paginas = Object.keys(palavrasPorPagina).sort((a, b) => Number(a) - Number(b));
    const linhasPorPagina = paginas.map(k => agruparEmLinhas(palavrasPorPagina[k] || []));
    const abaixo = (rotulo, formato) => {
      for (const linhas of linhasPorPagina) { const v = valorAbaixoDoRotulo(linhas, rotulo, formato); if (v) return v; }
      return null;
    };
    const DATA = /(\d{2}\/\d{2}\/\d{4})/;
    if (!campos.vencimento) { const v = abaixo(/vencimento/i, DATA); if (v && dataPlausivel(v)) campos.vencimento = v; }
    if (!campos.dataEmissao) { const v = abaixo(/emiss[aã]o/i, DATA); if (v && dataPlausivel(v)) campos.dataEmissao = v; }
    if (campos.valor == null) {
      const v = abaixo(/valor\s+(?:do\s+documento|total|cobrado|a\s+pagar)/i, new RegExp(`(?:R\\$\\s*)?${VALOR}`));
      const n = v !== null ? paraNumeroBr(v) : null;
      if (n !== null && valorPlausivel(n)) campos.valor = n;
    }
  }

  // Linha digitável e chave de acesso: a sequência (ou a janela dela, se o
  // OCR grudou um dígito solto) que passa nos dígitos verificadores. Uma
  // vez validadas, os dados que elas carregam valem mais que a regex.
  const sequencias = sequenciasLongas(texto);
  let usadaNaLinha = null;
  for (const seq of sequencias) {
    const linha = janelaValida(seq, 47, linhaDigitavelValida) || janelaValida(seq, 48, linhaDigitavelValida);
    if (linha) { campos.linhaDigitavel = linha; validados.add('linhaDigitavel'); usadaNaLinha = seq; break; }
  }
  if (campos.linhaDigitavel) {
    const dados = dadosDaLinha(campos.linhaDigitavel);
    if (valorPlausivel(dados.valor)) { campos.valor = dados.valor; validados.add('valor'); }
    if (dados.vencimento) { campos.vencimento = isoParaBr(dados.vencimento); validados.add('vencimento'); }
  }
  for (const seq of sequencias) {
    if (seq === usadaNaLinha) continue;
    const chave = janelaValida(seq, 44, chaveNfeValida);
    if (chave) { campos.chaveAcesso = chave; validados.add('chaveAcesso'); break; }
  }
  if (campos.chaveAcesso) {
    const dados = dadosDaChave(campos.chaveAcesso);
    // Número: a chave confirma o que foi lido, ou supre quando não foi lido
    // nada. Se os dois divergem, nenhum vence sozinho -- o módulo 11 da
    // chave não pega toda troca de DOIS dígitos, então ela pode estar
    // errada e ainda passar: fica o número lido, e os dois vão pra conferir.
    if (!campos.numeroNota) { campos.numeroNota = dados.numeroNota; validados.add('numeroNota'); }
    else if (semZeros(campos.numeroNota) === dados.numeroNota) validados.add('numeroNota');
    else {
      invalidos.numeroNota = 'não bate com a chave de acesso';
      invalidos.chaveAcesso = 'número da nota na chave não bate com o lido';
      validados.delete('chaveAcesso');
    }
    // CNPJ do emitente: passa num segundo dígito verificador (o do próprio
    // CNPJ), então uma chave mal lida dificilmente produz um CNPJ válido.

    if (cnpjValido(dados.cnpjEmitente)) {
      if (soDigitos(campos.cnpj) !== dados.cnpjEmitente) { campos.cnpj = formatarCnpj(dados.cnpjEmitente); delete campos.cpf; delete invalidos.cpf; }
      delete invalidos.cnpj;
      validados.add('cnpj');
    }
    if (campos.dataEmissao) {
      if (brParaMes(campos.dataEmissao) === dados.mesEmissao) validados.add('dataEmissao');
      else invalidos.dataEmissao = 'não bate com o mês da chave de acesso';
    }
  }

  if (hints && hints.length) {
    const hintsDeCampo = hints.filter(h => h.campo !== 'tipo');
    // Âncora de texto primeiro (mesmo comportamento de sempre, override
    // sobre a escolha genérica), posição por último -- assim posição fica
    // com a prioridade mais alta quando os dois tipos de hint existem pro
    // mesmo campo, sem regredir o caso em que só existe âncora de texto.
    const dosHints = {
      ...aplicarHints(texto, hintsDeCampo),
      ...aplicarHintsDePosicao(hintsDeCampo, palavrasPorPagina, { tiposPorPagina: tiposDasPaginas(palavrasPorPagina), valida: valorValidoParaCampo }),
    };
    for (const [campo, valor] of Object.entries(dosHints)) {
      if (campos[campo] !== valor) { validados.delete(campo); delete invalidos[campo]; }
      campos[campo] = valor;
    }
  }
  return { campos, validados: [...validados], invalidos, documentosCandidatos: candidatos.map(c => c.digitos) };
}

// Só os campos (formato de sempre: { numeroNota, valor, cnpj | cpf, data,
// dataEmissao, vencimento, linhaDigitavel, chaveAcesso }). palavrasPorPagina
// (opcional): { [pagina]: palavras[] } do documento ATUAL, só existe
// quando o leitor gerou palavras posicionadas (ver ocr_imagem.js/
// pdf_render.js) -- ausente, os hints de posição não se aplicam.
export function extrairCampos(texto, hints, palavrasPorPagina) {
  return extrairCamposDetalhado(texto, hints, palavrasPorPagina).campos;
}

// Confiança por campo (0-100): a MENOR confiança do Tesseract entre as
// palavras de onde aquele valor saiu -- basta um dígito mal lido pra o
// valor inteiro estar errado. Acha as palavras pelos dígitos do valor
// (o texto de OCR traz pontuação/espaço trocados com frequência, os
// dígitos são o que importa). Texto embutido de PDF digital (fonte
// 'pdf_texto') não é OCR: confiança 100. Valor que não dá pra localizar
// nas palavras (ex: veio de uma âncora aprendida que juntou pedaços)
// fica null -- quem usa trata como duvidoso.
export const CONFIANCA_MINIMA_CAMPO = 85;
const CAMPOS_COM_CONFIANCA = ['numeroNota', 'valor', 'cnpj', 'cpf', 'data', 'dataEmissao', 'vencimento', 'linhaDigitavel', 'chaveAcesso'];

function digitosDoCampo(campo, valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  if (campo === 'valor') return soDigitos(Number(valor).toFixed(2));
  return soDigitos(valor);
}

// Palavras de onde saiu um valor (achadas pelos dígitos) e a menor
// confiança entre elas -- o trecho mais confiável, se o valor aparece mais
// de uma vez. null se não acha.
function trechoDoCampo(palavras, alvo) {
  if (!alvo) return null;
  let melhor = null;
  for (let i = 0; i < palavras.length; i++) {
    if (!soDigitos(palavras[i].texto)) continue;
    let acumulado = '', minima = Infinity;
    const usadas = [];
    for (let j = i; j < Math.min(palavras.length, i + 8); j++) {
      const d = soDigitos(palavras[j].texto);
      if (!d) continue;
      acumulado += d;
      usadas.push(palavras[j]);
      minima = Math.min(minima, typeof palavras[j].conf === 'number' ? palavras[j].conf : 100);
      if (acumulado.includes(alvo)) { if (!melhor || minima > melhor.conf) melhor = { conf: minima, palavras: [...usadas] }; break; }
      if (acumulado.length > alvo.length + 12) break;
    }
  }
  return melhor;
}
function confiancaDoTrecho(palavras, alvo) {
  const t = trechoDoCampo(palavras, alvo);
  return t ? t.conf : null;
}
const palavrasEmOrdem = (palavrasPorPagina) => Object.keys(palavrasPorPagina || {})
  .sort((a, b) => Number(a) - Number(b))
  .flatMap(k => (palavrasPorPagina[k] || []).map(p => ({ ...p, pagina: Number(k) })));

// campos: resultado de extrairCampos; palavrasPorPagina: { [pagina]:
// palavras[] } (com `conf`, ver ocr_imagem.js); fonte: 'pdf_texto' | 'ocr';
// validacao (opcional): { validados, invalidos } de extrairCamposDetalhado
// -- campo validado por dígito verificador não fica duvidoso mesmo com
// leitura de confiança média (o DV confirma cada dígito); campo inválido
// fica duvidoso mesmo em PDF digital. Devolve { confiancaCampos: { campo:
// 0-100 | null }, camposDuvidosos: [] }.
export function confiancaDosCampos(campos, palavrasPorPagina, fonte, validacao = {}) {
  const validados = validacao.validados || [];
  const invalidos = validacao.invalidos || {};
  const confiancaCampos = {};
  const nomes = Object.keys(campos || {}).filter(c => CAMPOS_COM_CONFIANCA.includes(c));
  if (fonte !== 'ocr') {
    nomes.forEach(c => { confiancaCampos[c] = 100; });
  } else {
    const palavras = palavrasEmOrdem(palavrasPorPagina);
    for (const c of nomes) confiancaCampos[c] = validados.includes(c) ? 100 : confiancaDoTrecho(palavras, digitosDoCampo(c, campos[c]));
  }
  const camposDuvidosos = nomes.filter(c => invalidos[c]
    || (fonte === 'ocr' && !validados.includes(c) && (confiancaCampos[c] === null || confiancaCampos[c] < CONFIANCA_MINIMA_CAMPO)));
  return { confiancaCampos, camposDuvidosos };
}

// Reclassifica um texto já extraído (sem reprocessar PDF/OCR -- caro e
// desnecessário) com as dicas do fornecedor selecionado. Usado quando a
// pessoa escolhe o fornecedor DEPOIS de já ter anexado os documentos (a
// ordem normal do formulário), pra reaplicar o que já foi aprendido pra
// esse fornecedor especificamente.
// fonte ('pdf_texto' | 'ocr', ver analisarAnexo): define a confiança dos
// campos -- sem ela, vale "tem palavras posicionadas = veio de OCR".
export function reclassificarComHints(texto, hints, palavrasPorPagina, fonte) {
  let tipoDetectado = classificarTipoDocumento(texto);
  if (tipoDetectado === 'nao_identificado' && hints && hints.length) {
    const hintTipo = hints.find(h => h.campo === 'tipo' && h.valor_exemplo);
    if (hintTipo) tipoDetectado = hintTipo.valor_exemplo;
  }
  const { campos, validados, invalidos, documentosCandidatos } = extrairCamposDetalhado(texto, hints, palavrasPorPagina);
  const { confiancaCampos, camposDuvidosos } = confiancaDosCampos(campos, palavrasPorPagina, fonte || (palavrasPorPagina ? 'ocr' : 'pdf_texto'), { validados, invalidos });
  return { tipoDetectado, campos, confiancaCampos, camposDuvidosos, camposValidados: validados, camposInvalidos: invalidos, documentosCandidatos };
}

// Segunda leitura dirigida (etapa 4 do OCR): em vez de reler a página
// inteira, relê SÓ as regiões que importam, como uma linha só e aceitando
// só dígitos e pontuação -- o Tesseract erra bem menos assim:
//   - linha com uma sequência longa de dígitos (linha digitável / chave de
//     acesso) que não passou no dígito verificador;
//   - as palavras de onde saiu um campo duvidoso (valor, CNPJ, datas,
//     número).
// regioesParaReler decide o quê (puro); a leitura em si é relerRegioes
// (ocr_imagem.js); aplicarReleituras decide o que aproveitar (puro).
export const MAX_REGIOES_RELEITURA = 4;
const CARACTERES_NUMERICOS = '0123456789.,/- ';
const CAMPOS_RELEITURA = ['valor', 'cnpj', 'cpf', 'vencimento', 'dataEmissao', 'data', 'numeroNota'];

function caixaDe(palavras) {
  const x0 = Math.min(...palavras.map(p => p.x0)), x1 = Math.max(...palavras.map(p => p.x1));
  const y0 = Math.min(...palavras.map(p => p.y0)), y1 = Math.max(...palavras.map(p => p.y1));
  const mx = (y1 - y0) * 0.6, my = (y1 - y0) * 0.35;
  return { x: Math.max(0, x0 - mx), y: Math.max(0, y0 - my), largura: Math.min(1, x1 + mx) - Math.max(0, x0 - mx), altura: Math.min(1, y1 + my) - Math.max(0, y0 - my) };
}

// leitura: resultado de reclassificarComHints. Devolve até
// MAX_REGIOES_RELEITURA regiões { pagina, campo, retangulo (frações),
// caracteres }.
export function regioesParaReler(leitura, palavrasPorPagina) {
  if (!palavrasPorPagina || !leitura) return [];
  const regioes = [];
  const campos = leitura.campos || {};
  if (!campos.linhaDigitavel || !campos.chaveAcesso) {
    for (const k of Object.keys(palavrasPorPagina).sort((a, b) => Number(a) - Number(b))) {
      for (const linha of agruparEmLinhas(palavrasPorPagina[k] || [])) {
        const digitos = soDigitos(corrigirConfusoes(linha.texto));
        if (digitos.length < 38) continue;
        if ([campos.linhaDigitavel, campos.chaveAcesso].some(v => v && digitos.includes(v))) continue;
        regioes.push({ pagina: Number(k), campo: 'sequencia', retangulo: caixaDe(linha.palavras), caracteres: CARACTERES_NUMERICOS });
      }
    }
  }
  const palavras = palavrasEmOrdem(palavrasPorPagina);
  for (const c of CAMPOS_RELEITURA) {
    if (!(leitura.camposDuvidosos || []).includes(c) || campos[c] == null) continue;
    const trecho = trechoDoCampo(palavras, digitosDoCampo(c, campos[c]));
    if (!trecho) continue;
    regioes.push({ pagina: trecho.palavras[0].pagina, campo: c, retangulo: caixaDe(trecho.palavras), caracteres: CARACTERES_NUMERICOS + (c === 'valor' ? 'R$' : '') });
  }
  return regioes.slice(0, MAX_REGIOES_RELEITURA);
}

// releituras: [{ ...regiao, texto, confianca }]. Devolve a leitura
// atualizada (não muda a original): sequências relidas que passam no
// dígito verificador entram re-extraindo o texto com elas no fim (a
// linha digitável / chave e o que vem delas: valor, vencimento, CNPJ,
// número); campo duvidoso relido só é trocado quando o valor novo é
// plausível e a releitura teve confiança MAIOR (CNPJ/CPF: quando passa no
// DV) -- senão fica o que já havia.
export function aplicarReleituras(leitura, releituras, { texto, hints, palavrasPorPagina, fonte }) {
  let atual = leitura;
  const sequencias = releituras.filter(r => r.campo === 'sequencia' && r.texto);
  if (sequencias.length) {
    const nova = reclassificarComHints(`${texto}\n${sequencias.map(r => r.texto).join('\n')}`, hints, palavrasPorPagina, fonte);
    const ganhou = ['linhaDigitavel', 'chaveAcesso'].some(c => nova.camposValidados.includes(c) && !atual.camposValidados.includes(c));
    if (ganhou) atual = nova;
  }
  const campos = { ...atual.campos };
  const confiancaCampos = { ...atual.confiancaCampos };
  let duvidosos = [...atual.camposDuvidosos];
  const validados = [...atual.camposValidados];
  for (const r of releituras) {
    if (r.campo === 'sequencia' || !r.texto || !duvidosos.includes(r.campo)) continue;
    const anterior = confiancaCampos[r.campo] ?? 0;
    let valor = null, validado = false;
    if (r.campo === 'cnpj' || r.campo === 'cpf') {
      const d = soDigitos(corrigirConfusoes(r.texto));
      const doc = janelaValida(d, r.campo === 'cnpj' ? 14 : 11, r.campo === 'cnpj' ? cnpjValido : cpfValido);
      if (doc) { valor = r.campo === 'cnpj' ? formatarCnpj(doc) : formatarCpf(doc); validado = true; }
    } else if (r.campo === 'valor') {
      const m = r.texto.match(new RegExp(VALOR));
      const n = m ? paraNumeroBr(m[1]) : null;
      if (n !== null && valorPlausivel(n)) valor = n;
    } else if (r.campo === 'numeroNota') {
      const d = soDigitos(r.texto);
      if (d && d.length <= 10) valor = d;
    } else {
      const m = r.texto.match(/(\d{2}\/\d{2}\/\d{4})/);
      if (m && dataPlausivel(m[1])) valor = m[1];
    }
    if (valor === null || (!validado && r.confianca <= anterior)) continue;
    campos[r.campo] = valor;
    confiancaCampos[r.campo] = validado ? 100 : r.confianca;
    if (validado || r.confianca >= CONFIANCA_MINIMA_CAMPO) duvidosos = duvidosos.filter(c => c !== r.campo);
    if (validado) validados.push(r.campo);
  }
  return { ...atual, campos, confiancaCampos, camposDuvidosos: duvidosos, camposValidados: [...new Set(validados)] };
}

// file: File/Blob escolhido pelo usuário (ver bindAnexosArea). Devolve
// { nomeArquivo, fonte, tipoDetectado, texto, campos, palavrasPorPagina,
// confiancaCampos, camposDuvidosos (ver confiancaDosCampos),
// camposValidados, camposInvalidos, documentosCandidatos (ver
// extrairCamposDetalhado) }
// -- fonte é 'pdf_texto' | 'ocr' | 'nao_lido' (formato não suportado, ou
// nada reconhecível: aparece assim na UI, nunca trava o anexo em si).
// palavrasPorPagina ({ [pagina]: palavras[] }, ver ocr_imagem.js/
// extracao_posicional.js): só existe quando o OCR conseguiu localizar
// palavras (imagem, ou página de PDF escaneado) -- PDF com texto vetorial
// (fonte 'pdf_texto') ainda não gera isso (falta renderização em canvas,
// ver pdf_render.js/Fase 3); indefinido nesse caso, não um objeto vazio,
// pra distinguir "não se aplica" de "não achou nada". hints: dicas do
// fornecedor já selecionado no formulário (vazio/undefined se ainda não
// escolhido -- nesse caso dá pra reaplicar depois via
// reclassificarComHints(), sem reprocessar o arquivo).
export async function analisarAnexo(file, hints) {
  const nome = file.name || '';
  const tipoMime = (file.type || '').toLowerCase();
  const ehPdf = tipoMime === 'application/pdf' || /\.pdf$/i.test(nome);
  const ehImagem = tipoMime.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(nome);

  let texto = '';
  let fonte = 'nao_lido';
  let palavrasPorPagina;
  const imagensPorPagina = {}; // { [pagina]: { origem, rotacao } } -- pra segunda leitura

  if (ehPdf) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { extrairConteudoPdf } = await import('./pdf_texto.js');
      const resultado = await extrairConteudoPdf(bytes);
      texto = resultado.texto;
      if (texto) {
        fonte = 'pdf_texto';
        // Palavras posicionadas do texto vetorial (sem OCR): fazem as dicas
        // de posição por fornecedor e o layout valerem também pro PDF
        // digital -- a maioria dos anexos. Sem pdf.js (ex: sem rede pro
        // CDN), segue só com o texto, como sempre foi.
        try {
          const { palavrasDoPdf } = await import('./pdf_render.js');
          const porPagina = await palavrasDoPdf(file);
          if (Object.keys(porPagina).length) palavrasPorPagina = porPagina;
        } catch { /* fica sem palavras posicionadas */ }
      } else if (resultado.imagensSemTexto.length > 0) {
        const { extrairTextoDeImagem } = await import('./ocr_imagem.js');
        const textos = [];
        palavrasPorPagina = {};
        for (const img of resultado.imagensSemTexto) {
          try {
            const { texto: textoImg, palavras, rotacao } = await extrairTextoDeImagem(img);
            textos.push(textoImg);
            if (palavras.length) {
              palavrasPorPagina[img.pagina || 1] = palavras;
              imagensPorPagina[img.pagina || 1] = { origem: img, rotacao: rotacao || 0 };
            }
          } catch { /* imagem em formato sem suporte de OCR direto */ }
        }
        texto = textos.join('\n').trim();
        if (texto) fonte = 'ocr';
      }
    } catch { /* PDF corrompido/criptografado -- fica como não lido */ }
  } else if (ehImagem) {
    try {
      const { extrairTextoDeImagem } = await import('./ocr_imagem.js');
      const resultado = await extrairTextoDeImagem(file);
      texto = resultado.texto;
      if (resultado.palavras.length) {
        palavrasPorPagina = { 1: resultado.palavras };
        imagensPorPagina[1] = { origem: file, rotacao: resultado.rotacao || 0 };
      }
      if (texto) fonte = 'ocr';
    } catch { /* motor de OCR indisponível (ex: sem rede pro CDN) */ }
  }

  let leitura = texto
    ? reclassificarComHints(texto, hints, palavrasPorPagina, fonte)
    : { tipoDetectado: 'nao_identificado', campos: {}, confiancaCampos: {}, camposDuvidosos: [], camposValidados: [], camposInvalidos: {}, documentosCandidatos: [] };
  if (fonte === 'ocr') {
    const regioes = regioesParaReler(leitura, palavrasPorPagina).filter(r => imagensPorPagina[r.pagina]);
    if (regioes.length) {
      try {
        const { relerRegioes } = await import('./ocr_imagem.js');
        const releituras = [];
        for (const pagina of [...new Set(regioes.map(r => r.pagina))]) {
          const { origem, rotacao } = imagensPorPagina[pagina];
          releituras.push(...await relerRegioes(origem, regioes.filter(r => r.pagina === pagina), { rotacao }));
        }
        leitura = aplicarReleituras(leitura, releituras, { texto, hints, palavrasPorPagina, fonte });
      } catch { /* segunda leitura é só um reforço -- fica a primeira */ }
    }
  }
  return { nomeArquivo: nome, fonte, texto, palavrasPorPagina, ...leitura };
}
