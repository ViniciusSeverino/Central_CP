// tests/e2e/leitor_documentos_pdf_e_ocr.mjs
//
// A suíte jsdom (tests/regressao) prova a lógica de classificação/extração
// de campos com texto já pronto, mas não consegue rodar pdf-lib nem
// tesseract.js de verdade (import de CDN, bloqueado fora de um navegador
// real -- ver leitor_documentos_auditoria_ui.mjs). Este arquivo roda num
// Chromium de verdade (Playwright) e prova as duas pontas que realmente
// importam: extrair texto de um PDF digital de verdade, e rodar OCR de
// verdade numa imagem com texto renderizado.
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
let falhas = 0;
function checar(condicao, mensagem) {
  if (condicao) console.log(`  ✓ ${mensagem}`);
  else { falhas++; console.error(`  ✗ FALHOU: ${mensagem}`); }
}

console.log('=== sincronizando app/ a partir do código real ===');
execFileSync('node', ['sync.mjs'], { cwd: __dirname, stdio: 'inherit' });

const { startServer } = await import('./serve.mjs');
const { server, url } = await startServer();

// Mesma ponte de rede que pdf_zip_excel.mjs já usa pro CDN de pdf-lib/
// jszip/exceljs -- generalizada aqui pra QUALQUER host https (tesseract.js
// busca o worker/modelo de idioma de um CDN diferente do esm.sh, então
// não dá pra restringir só a esm.sh como o outro teste faz).
const envSemProxy = { ...process.env };
for (const k of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) delete envSemProxy[k];
const browser = await chromium.launch({ args: ['--no-sandbox'], env: envSemProxy });
const context = await browser.newContext();
await context.route('https://*/**', async (route) => {
  try {
    const upstream = await fetch(route.request().url());
    const body = Buffer.from(await upstream.arrayBuffer());
    const headers = {};
    upstream.headers.forEach((v, k) => { headers[k] = v; });
    delete headers['content-encoding']; delete headers['content-length'];
    await route.fulfill({ status: upstream.status, headers, body });
  } catch {
    await route.abort();
  }
});
const page = await context.newPage();
const consoleErros = [];
page.on('pageerror', e => consoleErros.push(e.message));

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.sidebar', { timeout: 5000 });

  console.log('\n### 1. pdf_texto.js extrai o texto de verdade de um PDF digital ###');
  const doc = await PDFDocument.create();
  const pdfPage = doc.addPage([300, 300]);
  const font = await doc.embedFont('Helvetica');
  pdfPage.drawText('NOTA FISCAL NF-77001', { x: 20, y: 250, size: 12, font });
  pdfPage.drawText('Fornecedor: Açaí & Café Ltda', { x: 20, y: 220, size: 12, font });
  pdfPage.drawText('VALOR TOTAL R$ 2.345,10', { x: 20, y: 190, size: 12, font });
  const pdfBytesArray = Array.from(await doc.save());

  const resultadoPdf = await page.evaluate(async (bytesArray) => {
    const { extrairConteudoPdf } = await import('/src/js/pdf_texto.js');
    const bytes = new Uint8Array(bytesArray);
    return await extrairConteudoPdf(bytes);
  }, pdfBytesArray);

  checar(resultadoPdf.texto.includes('NOTA FISCAL NF-77001'), 'texto do PDF extraído contém o número da NF');
  checar(resultadoPdf.texto.includes('Açaí & Café Ltda'), 'texto do PDF extraído preserva acentuação em português');
  checar(resultadoPdf.texto.includes('R$ 2.345,10'), 'texto do PDF extraído contém o valor');

  console.log('\n### 2. leitor_documentos.js classifica e extrai campos do texto de um PDF real ###');
  const analiseCompleta = await page.evaluate(async (bytesArray) => {
    const file = new File([new Uint8Array(bytesArray)], 'nota-fiscal-teste.pdf', { type: 'application/pdf' });
    const { analisarAnexo } = await import('/src/js/leitor_documentos.js');
    return await analisarAnexo(file);
  }, pdfBytesArray);
  checar(analiseCompleta.fonte === 'pdf_texto', 'analisarAnexo() real reconhece a fonte como "pdf_texto" (não OCR, tinha texto embutido)');
  checar(analiseCompleta.tipoDetectado === 'nota_fiscal', 'analisarAnexo() classifica o PDF como nota_fiscal (palavra-chave "NOTA FISCAL" no texto)');
  checar(analiseCompleta.campos.valor === 2345.10, `analisarAnexo() extrai o valor certo do PDF -- veio ${analiseCompleta.campos.valor}`);

  console.log('\n### 3. ocr_imagem.js roda OCR de verdade numa imagem com texto renderizado ###');
  const resultadoOcr = await page.evaluate(async () => {
    // desenha um texto simples e bem contrastado num canvas -- o caso
    // mais fácil possível pro OCR (fonte grande, preto no branco, sem
    // ruído), só pra provar que o motor de verdade roda e devolve algo.
    const canvas = document.createElement('canvas');
    canvas.width = 400; canvas.height = 120;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 400, 120);
    ctx.fillStyle = '#000'; ctx.font = 'bold 48px sans-serif';
    ctx.fillText('BOLETO 123', 20, 70);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const { extrairTextoDeImagem } = await import('/src/js/ocr_imagem.js');
    const texto = await extrairTextoDeImagem(blob);
    return { texto, tamanhoBlob: blob.size };
  });
  checar(resultadoOcr.tamanhoBlob > 0, 'canvas de teste gerou uma imagem PNG de verdade (tem bytes)');
  checar(typeof resultadoOcr.texto === 'string', 'extrairTextoDeImagem() roda o motor de OCR de verdade e devolve uma string (sem lançar erro)');
  // Não afirma igualdade exata com "BOLETO 123" -- OCR é probabilístico
  // (varia com fonte/renderização); o que importa aqui é que o pipeline
  // completo (tesseract.js via CDN, worker, reconhecimento) roda de
  // verdade sem quebrar. A pontuação normalmente pega ALGO reconhecível.
  checar(resultadoOcr.texto.toUpperCase().includes('BOLETO') || resultadoOcr.texto.toUpperCase().includes('123'), `OCR reconheceu pelo menos parte do texto renderizado -- veio "${resultadoOcr.texto.trim()}"`);

  checar(consoleErros.length === 0, `nenhum erro não tratado no console do navegador (${consoleErros.length} encontrado(s))`);
  if (consoleErros.length > 0) console.log(consoleErros);
} finally {
  await browser.close();
  server.close();
}

console.log(`\n=== resumo: ${falhas === 0 ? 'tudo passou' : falhas + ' falha(s)'} ===`);
process.exit(falhas === 0 ? 0 : 1);
