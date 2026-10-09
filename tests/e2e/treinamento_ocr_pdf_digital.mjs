// tests/e2e/treinamento_ocr_pdf_digital.mjs
//
// Aba Treinamento do leitor (só administrador), num Chromium de verdade
// com PDF DIGITAL (texto embutido -- a maioria dos anexos reais):
//   1. a aba lista as notas pagas e abre o documento página a página;
//   2. o leitor erra o nº da nota (pega o "Pedido" logo depois de "NOTA
//      FISCAL"); o administrador desenha um retângulo em volta do número
//      certo e salva -- vira dica do fornecedor com posição e TIPO da
//      página;
//   3. outra nota do mesmo fornecedor, com as páginas em ordem trocada
//      (boleto primeiro), passa a sair certa: a dica acha a página do tipo
//      certo -- é o "Conferir este fornecedor" (acerta 2 de 2);
//   4. a lista só mostra as notas em que o leitor diverge do lançado (a
//      aba lê os anexos sozinha e guarda o resultado); depois do treino, as
//      notas do fornecedor são reavaliadas e saem da lista.
// Prints opcionais: PRINTS=<pasta> node treinamento_ocr_pdf_digital.mjs
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRINTS = process.env.PRINTS || null;
let falhas = 0;
function checar(condicao, mensagem) {
  if (condicao) console.log(`  ✓ ${mensagem}`);
  else { falhas++; console.error(`  ✗ FALHOU: ${mensagem}`); }
}

// PDF de 2 páginas (600 x 800 pt): nota fiscal e boleto, na ordem pedida.
async function pdfDaNota({ numero, ordem }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const nf = () => {
    const p = doc.addPage([600, 800]);
    p.drawText('DANFE - NOTA FISCAL ELETRONICA', { x: 40, y: 760, size: 14, font });
    p.drawText('Pedido 998877', { x: 40, y: 735, size: 11, font });
    p.drawText('Documento', { x: 330, y: 700, size: 10, font });
    p.drawText(String(numero), { x: 420, y: 700, size: 12, font });
    p.drawText('CNPJ: 11.222.333/0001-81', { x: 40, y: 660, size: 11, font });
    p.drawText('DATA DA EMISSAO: 05/03/2026', { x: 40, y: 630, size: 11, font });
    p.drawText('VALOR TOTAL DA NOTA R$ 1.234,56', { x: 40, y: 600, size: 11, font });
  };
  const boleto = () => {
    const p = doc.addPage([600, 800]);
    p.drawText('Ficha de Compensacao - Boleto', { x: 40, y: 760, size: 14, font });
    p.drawText('Cedente: Fornecedor Treino Ltda', { x: 40, y: 735, size: 11, font });
    p.drawText('Vencimento 15/03/2026', { x: 40, y: 700, size: 11, font });
    p.drawText('Valor do documento R$ 1.234,56', { x: 40, y: 670, size: 11, font });
  };
  for (const tipo of ordem) (tipo === 'nf' ? nf : boleto)();
  return Array.from(await doc.save());
}

console.log('=== sincronizando app/ a partir do código real ===');
execFileSync('node', ['sync.mjs'], { cwd: __dirname, stdio: 'inherit' });
const { startServer } = await import('./serve.mjs');
const { server, url } = await startServer();

// Ponte de rede pro CDN (pdf.js, pdf-lib): ver leitor_documentos_pdf_e_ocr.mjs.
const envSemProxy = { ...process.env };
for (const k of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) delete envSemProxy[k];
const browser = await chromium.launch({ args: ['--no-sandbox'], env: envSemProxy });
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
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
const errosConsole = [];
page.on('pageerror', e => errosConsole.push(e.message));

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.sidebar', { timeout: 10000 });

  const pdf1 = await pdfDaNota({ numero: '123456', ordem: ['nf', 'boleto'] });
  const pdf2 = await pdfDaNota({ numero: '654321', ordem: ['boleto', 'nf'] });
  await page.evaluate(async ({ pdf1, pdf2 }) => {
    const mod = await import('/src/js/supabaseClient.js');
    const f = mod.__fixtures();
    f.fornecedores.push({ id: 'forn-treino', nome: 'Fornecedor Treino Ltda', cnpj: '11.222.333/0001-81', municipio: 'BAURU' });
    const nota = (id, numero, pdfPath, emissao) => ({
      id, numero_nota: numero, valor_bruto: '1234.56', valor_liquido: null, descricao: null, pagador_id: 'pag-1', fornecedor_id: 'forn-treino',
      forma_pagamento: 'Boleto bancário', classificacao: null, tem_rateio: false, centro_custo_id: 'cc-1', classe_conta_id: 'cl-1',
      codigo_classificacao_id: null, status: 'pago', pendente: false, motivo_pendencia: null, setor: 'Operações', criado_por: 'u-admin-e2e',
      criado_em: new Date().toISOString(), data_emissao: emissao, vencimento: '2026-04-01', competencia: '2026-03-01',
      aprovado_por: null, data_aprovacao: null, numero_chamado: null, data_pagamento: '2026-04-01',
      numero_lancamento_group: null, data_lancamento_group: null, data_validacao_csc: null, validado_por: null,
      anexo_arquivado_em: null, anexos: [pdfPath], nota_rateios: [], nota_historico: [],
    });
    f.notas.push(nota('nota-treino-1', '123456', 'nota-treino-1/final.pdf', '2026-03-05'));
    f.notas.push(nota('nota-treino-2', '654321', 'nota-treino-2/final.pdf', '2026-03-05'));
    const up = (path, bytes) => mod.supabase.storage.from('anexos-notas').upload(path, new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
    await up('nota-treino-1/final.pdf', pdf1);
    await up('nota-treino-2/final.pdf', pdf2);
    const state = await import('/src/js/state.js');
    const db = await import('/src/js/db.js');
    const appMod = await import('/src/js/app.js');
    state.app.notas = await db.carregarNotas();
    state.app.cadastros.fornecedores = f.fornecedores;
    appMod.render();
  }, { pdf1, pdf2 });

  console.log('\n### 1. aba Treinamento: lista só as notas em que o leitor diverge ###');
  const item = page.locator('[data-view="treinamento"]');
  checar(await item.count() === 1, 'administrador vê "Treinamento do leitor" no menu');
  await item.click();
  await page.waitForFunction(() => document.querySelectorAll('[data-treino-abrir]').length === 2 && /0 a avaliar/.test(document.getElementById('treino-resumo').textContent), null, { timeout: 60000 });
  checar(await page.locator('.treino-grupo').count() === 1, 'notas agrupadas por fornecedor');
  checar(true, 'a aba leu os dois anexos sozinha e lista as duas notas (o leitor erra o nº nas duas)');
  const linha1 = await page.locator('[data-treino-abrir="nota-treino-1"]').locator('xpath=ancestor::tr').textContent();
  checar(linha1.includes('Nº') && !linha1.includes('CNPJ'), `a linha mostra só o campo que diverge (${linha1.replace(/\s+/g, ' ').trim()})`);
  const avaliadas = await page.evaluate(async () => (await import('/src/js/supabaseClient.js')).__fixtures().ocr_avaliacao_notas || []);
  checar(avaliadas.length === 2 && avaliadas.every(a => a.campos.numeroNota.ok === false && a.campos.cnpj.ok === true), 'avaliação de cada nota guardada (nº diverge, CNPJ confere)');
  if (PRINTS) await page.screenshot({ path: join(PRINTS, 'treino_lista.png'), fullPage: true });

  console.log('\n### 2. abrir a nota: documento + cartões ###');
  await page.click('[data-treino-abrir="nota-treino-1"]');
  await page.waitForSelector('#treino-doc canvas', { timeout: 30000 });
  await page.waitForFunction(() => {
    const c = document.querySelector('[data-treino-campo="numeroNota"]');
    return c && !c.textContent.includes('lendo...');
  }, null, { timeout: 30000 });
  const tipo1 = await page.$eval('#treino-tipo-pagina', el => el.value);
  checar(tipo1 === 'nota_fiscal', `página 1 classificada como nota fiscal (veio ${tipo1})`);
  const cartaoNumero = page.locator('[data-treino-campo="numeroNota"]');
  checar((await cartaoNumero.textContent()).includes('Leitor erra'), 'cartão do nº mostra que o leitor erra hoje (pegou o "Pedido")');
  checar((await page.locator('[data-treino-campo="cnpj"]').textContent()).includes('Leitor acerta'), 'cartão do CNPJ mostra que o leitor já acerta');

  console.log('\n### 3. indicar o nº da nota desenhando no documento ###');
  await cartaoNumero.locator('[data-treino-indicar]').click();
  const canvas = page.locator('#treino-doc canvas');
  const box = await canvas.boundingBox();
  // "123456" em x=420..470 pt, linha de base y=700 (de baixo) numa página 600 x 800
  const x0 = box.x + box.width * (400 / 600), x1 = box.x + box.width * (500 / 600);
  const y0 = box.y + box.height * ((800 - 716) / 800), y1 = box.y + box.height * ((800 - 694) / 800);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 });
  await page.mouse.move(x1, y1, { steps: 4 });
  await page.mouse.up();
  await page.waitForSelector('[data-treino-salvar="numeroNota"]', { timeout: 5000 });
  checar((await cartaoNumero.textContent()).includes('confere com o lançado'), 'o que caiu no retângulo (123456) confere com o lançado');
  if (PRINTS) await page.screenshot({ path: join(PRINTS, 'treino_nota_indicando.png') });
  await page.click('[data-treino-salvar="numeroNota"]');
  await page.waitForFunction(() => document.querySelector('[data-treino-campo="numeroNota"]').textContent.includes('Leitor acerta'), null, { timeout: 10000 });
  checar(true, 'depois de salvar, o leitor passa a acertar o nº nesta nota');
  const dica = await page.evaluate(async () => {
    const mod = await import('/src/js/supabaseClient.js');
    return (mod.__fixtures().fornecedor_extracao_hints || []).find(h => h.fornecedor_id === 'forn-treino' && h.campo === 'numeroNota');
  });
  checar(dica && dica.pos_x != null && dica.pagina === 1 && dica.tipo_pagina === 'nota_fiscal', `dica gravada com posição, página e tipo da página (${JSON.stringify(dica && { pagina: dica.pagina, tipo: dica.tipo_pagina })})`);

  console.log('\n### 4. voltar à lista: as notas do fornecedor são reavaliadas ###');
  await page.click('#btn-treino-voltar');
  await page.waitForFunction(() => document.getElementById('treino-lista') && document.querySelectorAll('[data-treino-abrir]').length === 0, null, { timeout: 30000 });
  checar(true, 'depois do treino, as duas notas do fornecedor saem da lista (o leitor passou a acertar)');
  const resumo = await page.textContent('#treino-resumo');
  checar(/0\s*com divergência/.test(resumo) && /2\s*o leitor já acerta/.test(resumo), `resumo atualizado (${resumo.replace(/\s+/g, ' ').trim()})`);
  const avaliada2 = await page.evaluate(async () => ((await import('/src/js/supabaseClient.js')).__fixtures().ocr_avaliacao_notas || []).find(a => a.nota_id === 'nota-treino-2'));
  checar(avaliada2 && avaliada2.campos.numeroNota.ok === true, 'a outra nota do fornecedor (boleto na página 1) foi reavaliada com a dica nova e guardada');
  const aviso = await page.locator('.toast').allTextContents();
  checar(aviso.some(t => t.includes('1 de 1 nota(s) que divergiam passaram a acertar')), `aviso de quantas passaram a acertar (${aviso.join(' | ')})`);
  if (PRINTS) await page.screenshot({ path: join(PRINTS, 'treino_lista_depois.png'), fullPage: true });

  console.log('\n### 5. "mostrar também as que já acertam", conferir o fornecedor e concluir ###');
  await page.check('#treino-mostrar-acertos');
  await page.waitForSelector('[data-treino-abrir="nota-treino-1"]', { timeout: 5000 });
  checar((await page.locator('[data-treino-abrir="nota-treino-1"]').locator('xpath=ancestor::tr').textContent()).includes('Acerta tudo'), 'a nota treinada aparece como "Acerta tudo"');
  await page.click('[data-treino-abrir="nota-treino-1"]');
  await page.waitForFunction(() => {
    const c = document.querySelector('[data-treino-campo="numeroNota"]');
    return c && c.textContent.includes('Leitor acerta');
  }, null, { timeout: 30000 });
  await page.click('#btn-treino-conferir-fornecedor');
  await page.waitForFunction(() => /Lidas 2 de 2/.test(document.getElementById('treino-painel-fornecedor').textContent), null, { timeout: 60000 });
  const linhaNumero = await page.$$eval('#treino-painel-fornecedor tbody tr', trs => (trs.find(tr => tr.textContent.includes('Número da nota')) || {}).textContent || '');
  checar(linhaNumero.includes('2 de 2'), `"Conferir este fornecedor": nº da nota certo nas 2 notas -- ${linhaNumero.replace(/\s+/g, ' ').trim()}`);
  if (PRINTS) await page.screenshot({ path: join(PRINTS, 'treino_conferir_fornecedor.png') });
  await page.click('#btn-treino-concluir');
  await page.waitForSelector('#treino-lista', { timeout: 5000 });
  const treinada = await page.evaluate(async () => {
    const mod = await import('/src/js/supabaseClient.js');
    return (mod.__fixtures().ocr_treinamento_notas || []).find(t => t.nota_id === 'nota-treino-1');
  });
  checar(!!treinada && treinada.tipos_pagina && treinada.tipos_pagina[1] === 'nota_fiscal' && treinada.tipos_pagina[2] === 'boleto', `nota marcada como treinada, com o tipo de cada página (${JSON.stringify(treinada && treinada.tipos_pagina)})`);

  checar(errosConsole.length === 0, `nenhum erro não tratado no navegador (${errosConsole.length})`);
  if (errosConsole.length) console.log(errosConsole);
} finally {
  await browser.close();
  server.close();
}

console.log(`\n=== resumo: ${falhas === 0 ? 'tudo passou' : falhas + ' falha(s)'} ===`);
process.exit(falhas === 0 ? 0 : 1);
