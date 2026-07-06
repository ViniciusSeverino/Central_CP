// src/js/pdf_texto.js
//
// Extrai o texto "de verdade" (não OCR) de um PDF digital -- documento
// gerado por um sistema (boleto, DANFE, comprovante bancário em PDF)
// quase sempre tem o texto embutido no próprio arquivo, comprimido
// página a página. Usa o pdf-lib (já dependência do app, ver
// anexos_pdf.js) só pra navegar a ESTRUTURA do arquivo (páginas, objetos,
// fontes) -- a parte que nenhuma lib do projeto já resolve, a
// interpretação dos operadores de desenho de texto dentro do content
// stream de cada página, é escrita aqui do zero, com o inflate.js
// (também escrito do zero) pra descomprimir o /FlateDecode.
//
// Cobre bem o caso comum (fonte simples, texto em WinAnsiEncoding ou com
// /ToUnicode) -- para fontes CID/Type0 muito específicas o resultado
// pode sair incompleto, e uma página só de imagem (scan/foto) não tem
// texto nenhum pra extrair (ver imagensSemTexto, candidatas a OCR em
// ocr_imagem.js).
import { inflateZlib } from './inflate.js';

// WinAnsiEncoding (Annex D da especificação PDF) pros códigos 128-255 --
// 32-127 já é ASCII direto. Cobre os acentos do português (áéíóõçãê etc.)
const WIN_ANSI_128_255 = (() => {
  const tabela = {
    128: 0x20AC, 130: 0x201A, 131: 0x0192, 132: 0x201E, 133: 0x2026, 134: 0x2020, 135: 0x2021,
    136: 0x02C6, 137: 0x2030, 138: 0x0160, 139: 0x2039, 140: 0x0152, 142: 0x017D, 145: 0x2018,
    146: 0x2019, 147: 0x201C, 148: 0x201D, 149: 0x2022, 150: 0x2013, 151: 0x2014, 152: 0x02DC,
    153: 0x2122, 154: 0x0161, 155: 0x203A, 156: 0x0153, 158: 0x017E, 159: 0x0178,
  };
  const arr = new Array(256);
  for (let i = 160; i <= 255; i++) arr[i] = i; // 160-255 = Latin-1 direto (á=0xE1 etc.)
  for (const [k, v] of Object.entries(tabela)) arr[k] = v;
  return arr;
})();

function decodificarByteWinAnsi(byte) {
  if (byte < 128) return String.fromCharCode(byte);
  const cp = WIN_ANSI_128_255[byte];
  return cp ? String.fromCharCode(cp) : '';
}

// Extrai as tabelas bfchar/bfrange de uma stream /ToUnicode já
// descomprimida -- formato CMap (PostScript-like), bem mais restrito que
// PostScript de verdade, então dá pra ler só com regex (nenhuma engine de
// PostScript entra aqui).
function parseToUnicodeCMap(texto) {
  const mapa = new Map();
  const blocoChar = /beginbfchar([\s\S]*?)endbfchar/g;
  let m;
  while ((m = blocoChar.exec(texto))) {
    const pares = m[1].match(/<[0-9a-fA-F]+>\s*<[0-9a-fA-F]+>/g) || [];
    for (const par of pares) {
      const [src, dst] = par.match(/<([0-9a-fA-F]+)>/g).map(h => h.slice(1, -1));
      mapa.set(src.toLowerCase(), hexParaTexto(dst));
    }
  }
  const blocoRange = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = blocoRange.exec(texto))) {
    const linhas = m[1].match(/<[0-9a-fA-F]+>\s*<[0-9a-fA-F]+>\s*(<[0-9a-fA-F]+>|\[[^\]]*\])/g) || [];
    for (const linha of linhas) {
      const partes = linha.match(/<[0-9a-fA-F]+>|\[[^\]]*\]/g);
      if (!partes || partes.length < 3) continue;
      const srcIni = parseInt(partes[0].slice(1, -1), 16);
      const srcFim = parseInt(partes[1].slice(1, -1), 16);
      if (partes[2].startsWith('[')) {
        const destinos = partes[2].match(/<[0-9a-fA-F]+>/g) || [];
        destinos.forEach((d, i) => {
          const codigo = (srcIni + i).toString(16).padStart(partes[0].length - 2, '0');
          mapa.set(codigo.toLowerCase(), hexParaTexto(d.slice(1, -1)));
        });
      } else {
        const dstBase = parseInt(partes[2].slice(1, -1), 16);
        for (let c = srcIni; c <= srcFim; c++) {
          const codigo = c.toString(16).padStart(partes[0].length - 2, '0');
          mapa.set(codigo.toLowerCase(), String.fromCharCode(dstBase + (c - srcIni)));
        }
      }
    }
  }
  return mapa;
}

function hexParaTexto(hex) {
  let s = '';
  for (let i = 0; i < hex.length; i += 4) {
    const cp = parseInt(hex.slice(i, i + 4), 16);
    if (cp) s += String.fromCharCode(cp);
  }
  return s;
}

// Lê literal "(...)" respeitando escapes \n \r \t \\ \( \) e parênteses
// aninhados -- devolve { texto: bytesLatin1, resto: índice depois do ")". }
function lerStringLiteral(conteudo, inicio) {
  let i = inicio + 1, profundidade = 1;
  const bytes = [];
  while (i < conteudo.length && profundidade > 0) {
    const c = conteudo[i];
    if (c === '\\') {
      const prox = conteudo[i + 1];
      const mapa = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
      if (mapa[prox] !== undefined) { bytes.push(mapa[prox].charCodeAt(0)); i += 2; continue; }
      if (prox >= '0' && prox <= '7') {
        const oct = conteudo.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)[0];
        bytes.push(parseInt(oct, 8) & 0xff);
        i += 1 + oct.length;
        continue;
      }
      i += 2; // escape desconhecido -- ignora a barra
      continue;
    }
    if (c === '(') { profundidade++; bytes.push(c.charCodeAt(0)); i++; continue; }
    if (c === ')') { profundidade--; i++; if (profundidade > 0) bytes.push(c.charCodeAt(0)); continue; }
    bytes.push(c.charCodeAt(0));
    i++;
  }
  return { bytes, fim: i };
}

// Interpreta um content stream já descomprimido (string latin1, 1
// byte = 1 char) e devolve o texto mostrado, na ordem, com quebras de
// linha nos comandos de posicionamento (Td/TD/T*/Tm) e nos BT novos.
function extrairTextoDoConteudo(conteudo, cmapsPorFonte) {
  let saida = '';
  let i = 0;
  let ultimoCmap = null;
  const decodificarCodigo = (codigoHex) => {
    if (ultimoCmap && ultimoCmap.has(codigoHex)) return ultimoCmap.get(codigoHex);
    const byte = parseInt(codigoHex, 16);
    return decodificarByteWinAnsi(byte & 0xff);
  };
  const decodificarBytesComoTexto = (bytes) => {
    let t = '';
    for (const b of bytes) t += decodificarCodigo(b.toString(16).padStart(2, '0'));
    return t;
  };

  while (i < conteudo.length) {
    const c = conteudo[i];
    if (c === '(') {
      const { bytes, fim } = lerStringLiteral(conteudo, i);
      i = fim;
      // acha o operador seguinte (Tj, ', " ou início de TJ já tratado à parte)
      const resto = conteudo.slice(i, i + 4);
      if (/^\s*Tj/.test(resto) || /^\s*'/.test(resto) || /^\s*"/.test(resto)) saida += decodificarBytesComoTexto(bytes);
      continue;
    }
    if (c === '<') {
      const fimHex = conteudo.indexOf('>', i);
      if (fimHex === -1) { i++; continue; }
      const hex = conteudo.slice(i + 1, fimHex).replace(/\s/g, '');
      i = fimHex + 1;
      const bytes = [];
      for (let k = 0; k + 1 < hex.length; k += 2) bytes.push(parseInt(hex.slice(k, k + 2), 16));
      const resto = conteudo.slice(i, i + 4);
      if (/^\s*Tj/.test(resto)) saida += decodificarBytesComoTexto(bytes);
      continue;
    }
    if (c === '[') {
      // TJ: array de strings e números (espaçamento) -- concatena só as strings
      const fimArray = conteudo.indexOf(']', i);
      if (fimArray === -1) { i++; continue; }
      let bloco = '';
      let j = i + 1;
      while (j < fimArray) {
        if (conteudo[j] === '(') { const r = lerStringLiteral(conteudo, j); bloco += decodificarBytesComoTexto(r.bytes); j = r.fim; continue; }
        if (conteudo[j] === '<') {
          const fimHex = conteudo.indexOf('>', j);
          if (fimHex === -1 || fimHex > fimArray) break;
          const hex = conteudo.slice(j + 1, fimHex).replace(/\s/g, '');
          const bytes = [];
          for (let k = 0; k + 1 < hex.length; k += 2) bytes.push(parseInt(hex.slice(k, k + 2), 16));
          bloco += decodificarBytesComoTexto(bytes);
          j = fimHex + 1;
          continue;
        }
        j++;
      }
      i = fimArray + 1;
      const resto = conteudo.slice(i, i + 3);
      if (/^\s*TJ/.test(resto)) saida += bloco;
      continue;
    }
    // operadores de posicionamento -- vira quebra de linha (heurística
    // simples: cada "nova linha de texto" no PDF vira \n na saída).
    if (conteudo.startsWith('Td', i) || conteudo.startsWith('TD', i) || conteudo.startsWith('Tm', i) || conteudo.startsWith('T*', i)) {
      if (!/[\n ]$/.test(saida)) saida += '\n';
      i += 2;
      continue;
    }
    if (conteudo.startsWith('Tf', i)) {
      // "/F1 12 Tf" -- olha pra trás pra achar o nome da fonte selecionada
      const antes = conteudo.slice(Math.max(0, i - 40), i);
      const m = antes.match(/\/([A-Za-z0-9#+._-]+)\s+[\d.]+\s*$/);
      ultimoCmap = (m && cmapsPorFonte[m[1]]) || ultimoCmap;
      i += 2;
      continue;
    }
    i++;
  }
  return saida;
}

// Constrói, pra uma página, um mapa "nome da fonte no Resources -> Map de
// ToUnicode" -- usado só quando a fonte tem CMap embutido (fontes
// simples com WinAnsiEncoding puro não precisam disso).
function cmapsDaPagina(pagina, PDFName) {
  const cmaps = {};
  try {
    const resources = pagina.node.Resources && pagina.node.Resources();
    if (!resources) return cmaps;
    const fontesDict = resources.lookup(PDFName.of('Font'));
    if (!fontesDict) return cmaps;
    const entradas = fontesDict.entries ? fontesDict.entries() : [];
    for (const [nome, ref] of entradas) {
      try {
        const fonte = pagina.node.context.lookup(ref);
        const toUnicodeRef = fonte.dict ? fonte.dict.get(PDFName.of('ToUnicode')) : fonte.get(PDFName.of('ToUnicode'));
        if (!toUnicodeRef) continue;
        const stream = pagina.node.context.lookup(toUnicodeRef);
        const bytes = descomprimirStream(stream, PDFName);
        const texto = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
        cmaps[nome.encodedName ? nome.encodedName.slice(1) : String(nome)] = parseToUnicodeCMap(texto);
      } catch { /* fonte sem ToUnicode legível -- cai no WinAnsi */ }
    }
  } catch { /* página sem Resources/Font -- segue com WinAnsi puro */ }
  return cmaps;
}

function descomprimirStream(stream, PDFName) {
  const bytesRaw = stream.getContents();
  const filtro = stream.dict.get(PDFName.of('Filter'));
  const nomeFiltro = filtro && (filtro.encodedName || (filtro.get && filtro.get(0) && filtro.get(0).encodedName));
  if (nomeFiltro === '/FlateDecode') return inflateZlib(bytesRaw);
  return bytesRaw; // sem filtro, ou filtro não suportado (ex: LZW) -- devolve cru
}

// imagem de página inteira (scan/foto) embutida como XObject -- só
// consegue extrair de verdade quando o filtro é DCTDecode (JPEG), que já
// é um arquivo JPEG válido em si mesmo (não precisa decodificar nada).
function imagemDePaginaSemTexto(pagina, PDFName) {
  try {
    const resources = pagina.node.Resources && pagina.node.Resources();
    if (!resources) return null;
    const xobjects = resources.lookup(PDFName.of('XObject'));
    if (!xobjects) return null;
    const entradas = xobjects.entries ? xobjects.entries() : [];
    for (const [, ref] of entradas) {
      const obj = pagina.node.context.lookup(ref);
      const subtype = obj.dict.get(PDFName.of('Subtype'));
      if (!subtype || subtype.encodedName !== '/Image') continue;
      const filtro = obj.dict.get(PDFName.of('Filter'));
      const nomeFiltro = filtro && (filtro.encodedName || (filtro.get && filtro.get(0) && filtro.get(0).encodedName));
      if (nomeFiltro === '/DCTDecode') {
        return { bytes: obj.getContents(), mime: 'image/jpeg' };
      }
    }
  } catch { /* sem XObject de imagem, ou filtro não suportado */ }
  return null;
}

// bytes: Uint8Array de um PDF. Devolve { texto, imagensSemTexto } --
// texto é a concatenação do texto de todas as páginas que tinham
// conteúdo textual reconhecível; imagensSemTexto é uma lista de
// { pagina, bytes, mime } das páginas SEM texto que tinham uma imagem de
// página inteira embutida (candidatas a OCR, ver ocr_imagem.js).
export async function extrairConteudoPdf(bytes) {
  const { PDFDocument, PDFName } = await import('https://esm.sh/pdf-lib@1.17.1');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const paginas = doc.getPages();
  let textoTotal = '';
  const imagensSemTexto = [];

  for (let idx = 0; idx < paginas.length; idx++) {
    const pagina = paginas[idx];
    const contentsRef = pagina.node.Contents();
    // Página sem /Contents nenhum (raro, mas acontece) não tem texto --
    // mas ainda pode ter uma imagem de página inteira nos Resources, por
    // isso NÃO pula a página aqui, só pula a extração de texto.
    const refs = contentsRef ? (contentsRef.array ? contentsRef.array : [contentsRef]) : [];
    const cmaps = cmapsDaPagina(pagina, PDFName);
    let textoPagina = '';
    for (const ref of refs) {
      try {
        const stream = pagina.node.context.lookup(ref);
        const bytesDescomprimidos = descomprimirStream(stream, PDFName);
        const conteudo = Array.from(bytesDescomprimidos).map(b => String.fromCharCode(b)).join('');
        textoPagina += extrairTextoDoConteudo(conteudo, cmaps);
      } catch { /* content stream ilegível -- segue pras próximas */ }
    }
    const semTextoReal = textoPagina.replace(/\s/g, '').length < 4;
    if (semTextoReal) {
      const imagem = imagemDePaginaSemTexto(pagina, PDFName);
      if (imagem) imagensSemTexto.push({ pagina: idx + 1, ...imagem });
    } else {
      textoTotal += (textoTotal ? '\n' : '') + textoPagina.trim();
    }
  }
  return { texto: textoTotal.trim(), imagensSemTexto };
}
