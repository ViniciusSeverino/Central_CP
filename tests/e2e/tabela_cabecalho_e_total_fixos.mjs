// tests/e2e/tabela_cabecalho_e_total_fixos.mjs
//
// "Todas as notas" com muitas linhas: o cabeçalho e a linha de total ficam
// fixos e quem rola é só a tabela (ver src/js/tabelas_fixas.js e .tbl-fixa
// em styles.css). Precisa de navegador real -- jsdom não faz layout, então
// não dá pra medir posição/altura nem position:sticky lá.
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

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

const envSemProxy = { ...process.env };
for (const k of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) delete envSemProxy[k];
const browser = await chromium.launch({ args: ['--no-sandbox'], env: envSemProxy });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErros = [];
page.on('pageerror', (e) => consoleErros.push(e.message));

await page.goto(url);
await page.waitForTimeout(600);

// 40 notas do ano corrente (o filtro padrão de "Todas as notas" é o ano
// corrente por vencimento), a primeira com rateio -- pra ter o que expandir.
await page.evaluate(async () => {
  const mod = await import('/src/js/supabaseClient.js');
  const f = mod.__fixtures();
  const ano = new Date().getFullYear();
  for (let i = 0; i < 40; i++) {
    const id = `nota-tbl-${i}`;
    f.notas.push({
      id, numero_nota: `T-${i}`, valor_bruto: '100.00', valor_liquido: '100.00', tem_retencao_imposto: false, descricao: null,
      pagador_id: 'pag-1', fornecedor_id: 'forn-1', forma_pagamento: 'Boleto bancário',
      classificacao: 'compras', tem_rateio: i === 0, centro_custo_id: 'cc-1', classe_conta_id: 'cl-1',
      codigo_classificacao_id: null, status: 'lancado', pendente: false, motivo_pendencia: null,
      setor: 'Operações', criado_por: 'u-admin-e2e', criado_em: new Date(Date.now() - i * 60000).toISOString(),
      data_emissao: `${ano}-03-01`, vencimento: `${ano}-03-${String((i % 27) + 1).padStart(2, '0')}`, competencia: `${ano}-03-01`,
      aprovado_por: null, data_aprovacao: null, numero_chamado: null, data_pagamento: null,
      numero_lancamento_group: null, data_lancamento_group: null, data_validacao_csc: null, validado_por: null,
      anexo_arquivado_em: null, anexos: [], nota_historico: [],
      nota_rateios: i === 0 ? [
        { id: 'r1', nota_id: id, valor: '60.00', centro_custo_id: 'cc-1', classe_conta_id: 'cl-1', codigo_classificacao_id: null, descricao: null },
        { id: 'r2', nota_id: id, valor: '40.00', centro_custo_id: 'cc-1', classe_conta_id: 'cl-1', codigo_classificacao_id: null, descricao: null },
      ] : [],
    });
  }
  const state = await import('/src/js/state.js');
  const db = await import('/src/js/db.js');
  const appMod = await import('/src/js/app.js');
  state.app.notas = await db.carregarNotas();
  appMod.render();
});
await page.waitForTimeout(300);
await page.click('[data-view="todas"]');
await page.waitForTimeout(400);

const medir = () => page.evaluate(() => {
  const wrap = document.querySelector('[data-tbl-fixa="todas-notas"]');
  const r = (el) => el.getBoundingClientRect();
  return {
    existe: !!wrap,
    scrollTop: wrap.scrollTop,
    rolavel: wrap.scrollHeight > wrap.clientHeight,
    wrapTop: r(wrap).top, wrapBottom: r(wrap).bottom,
    thTop: r(wrap.querySelector('thead th')).top,
    tfootBottom: r(wrap.querySelector('tfoot td')).bottom,
    paginaRola: document.documentElement.scrollHeight > window.innerHeight + 1,
    janela: window.innerHeight,
  };
});

console.log('\n### 1. Tabela ocupa o resto da tela e rola sozinha ###');
let m = await medir();
checar(m.existe, 'a tabela de "Todas as notas" é uma tabela fixa (data-tbl-fixa)');
checar(m.rolavel, 'com 40+ notas, a tabela tem rolagem própria');
checar(!m.paginaRola, 'a página em si não rola (só a tabela)');
checar(m.wrapBottom <= m.janela, 'o fim da tabela (linha de total) fica dentro da janela');

console.log('\n### 2. Cabeçalho e total ficam no lugar ao rolar ###');
await page.evaluate(() => { document.querySelector('[data-tbl-fixa="todas-notas"]').scrollTop = 400; });
await page.waitForTimeout(100);
m = await medir();
checar(m.scrollTop > 0, 'a tabela rolou por dentro');
checar(Math.abs(m.thTop - (m.wrapTop + 1)) <= 1, `cabeçalho continua grudado no topo da tabela (th ${m.thTop.toFixed(1)} x caixa ${m.wrapTop.toFixed(1)})`);
checar(Math.abs(m.tfootBottom - (m.wrapBottom - 1)) <= 1, `linha de total continua grudada embaixo (tfoot ${m.tfootBottom.toFixed(1)} x caixa ${m.wrapBottom.toFixed(1)})`);

console.log('\n### 3. Redesenhar a tela não perde a posição da rolagem ###');
const antes = m.scrollTop;
await page.evaluate(async () => { (await import('/src/js/app.js')).render(); });
await page.waitForTimeout(100);
m = await medir();
checar(m.scrollTop === antes, `a rolagem volta pro mesmo ponto depois de um render() (${antes} -> ${m.scrollTop})`);

console.log('\n### 4. Janela menor recalcula a altura ###');
await page.setViewportSize({ width: 1280, height: 680 });
await page.waitForTimeout(200);
m = await medir();
checar(!m.paginaRola && m.wrapBottom <= m.janela, 'depois de diminuir a janela, a tabela continua cabendo nela');

// Janela baixa demais: a tabela não encolhe abaixo de 280px (ilegível);
// nesse caso a página volta a rolar, como antes.
await page.setViewportSize({ width: 1280, height: 480 });
await page.waitForTimeout(200);
const altura = await page.evaluate(() => document.querySelector('[data-tbl-fixa="todas-notas"]').clientHeight);
checar(altura >= 278, `em janela baixa a tabela mantém a altura mínima (${altura}px)`);

checar(consoleErros.length === 0, `nenhum erro não tratado no console do navegador (${consoleErros.length} encontrado(s))`);

await browser.close();
server.close();

console.log(`\n=== resumo: ${falhas === 0 ? 'tudo passou' : falhas + ' falha(s)'} ===`);
if (falhas > 0) process.exit(1);
