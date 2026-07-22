// tests/e2e/admin_exclusoes_e_departamento.mjs
//
// Confirma no navegador de verdade (não jsdom) 3 fluxos administrativos
// recentes: excluir uma nota "recebido" ainda não completada, criar um
// departamento (setor) novo, e excluir permanentemente um usuário -- os
// três já têm cobertura em tests/regressao (jsdom), mas rodar aqui pega
// qualquer divergência real de renderização/clique que o jsdom não
// reproduz fielmente. Não toca em nenhum recurso de CDN (sem anexo, sem
// exportar Excel), então dispensa a ponte de rede que os outros arquivos
// desta pasta precisam.
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
const page = await browser.newPage();
const consoleErros = [];
page.on('pageerror', (e) => consoleErros.push(e.message));

await page.goto(url);
await page.waitForTimeout(600);

// Fixtures extras: um segundo usuário (pra não ser autoexclusão) e uma
// nota "recebido" (só alcançável via perfil recebedor, que este mock,
// de propósito, não tem -- ver header de mocks/supabaseClient.js).
await page.evaluate(async () => {
  const mod = await import('/src/js/supabaseClient.js');
  const f = mod.__fixtures();
  f.usuarios.push({ id: 'u-teste-2', auth_user_id: 'auth-teste-2', nome: 'Usuário de Teste', role: 'departamento', setor: null, perfil_departamento: 'completo', email: 'teste2@central-cp.local', ativo: true, criado_em: new Date().toISOString() });
  f.notas.push({
    id: 'nota-teste-recebido', numero_nota: null, valor_bruto: '0.00', descricao: null,
    pagador_id: null, fornecedor_id: null, forma_pagamento: null,
    classificacao: null, tem_rateio: false, centro_custo_id: 'cc-1', classe_conta_id: 'cl-1',
    codigo_classificacao_id: null, status: 'recebido', pendente: false, motivo_pendencia: null,
    setor: null, criado_por: 'u-admin-e2e', criado_em: new Date().toISOString(), data_emissao: null, vencimento: null, competencia: null,
    aprovado_por: null, data_aprovacao: null, numero_chamado: null, data_pagamento: null,
    numero_lancamento_group: null, data_lancamento_group: null, data_validacao_csc: null, validado_por: null,
    anexo_arquivado_em: null, anexos: [], nota_rateios: [], nota_historico: [],
  });
  const state = await import('/src/js/state.js');
  const db = await import('/src/js/db.js');
  const appMod = await import('/src/js/app.js');
  state.app.notas = await db.carregarNotas();
  appMod.render();
});
await page.waitForTimeout(300);

console.log('\n### 1. Excluir uma nota "recebido" ainda não pendente ###');
await page.click('[data-view="recebidos"]');
await page.waitForTimeout(300);
await page.click('[data-open="nota-teste-recebido"]');
await page.waitForTimeout(300);
const btnExcluirNota = await page.$('[data-excluir-nota="nota-teste-recebido"]');
checar(!!btnExcluirNota, 'botão "Excluir" aparece na nota "recebido" (não pendente)');
page.once('dialog', (d) => d.accept());
await btnExcluirNota.click();
await page.waitForTimeout(400);
const aindaExisteNota = await page.evaluate(async () => {
  const mod = await import('/src/js/supabaseClient.js');
  return mod.__fixtures().notas.some((n) => n.id === 'nota-teste-recebido');
});
checar(!aindaExisteNota, 'nota "recebido" foi excluída de fato');

console.log('\n### 2. Criar um departamento (setor) novo ###');
await page.click('[data-view="cadastros"]');
await page.waitForTimeout(300);
await page.click('[data-cad-tab="setores"]');
await page.waitForTimeout(300);
await page.fill('#cadnew-nome', 'TI');
await page.click('#btn-add-cadastro');
await page.waitForTimeout(400);
const setorCriado = await page.evaluate(async () => {
  const mod = await import('/src/js/supabaseClient.js');
  return mod.__fixtures().setores.some((s) => s.nome === 'TI');
});
checar(setorCriado, 'departamento "TI" foi criado de fato');
checar((await page.locator('td:has-text("TI")').count()) > 0, 'departamento novo aparece na lista da tela');

console.log('\n### 3. Excluir permanentemente um usuário (não o próprio) ###');
await page.click('[data-cad-tab="usuarios"]');
await page.waitForTimeout(300);
const btnExcluirUsuario = await page.$('[data-excluir-usuario="u-teste-2"]');
checar(!!btnExcluirUsuario, 'botão "Excluir" aparece pro usuário de teste');
page.once('dialog', (d) => d.accept());
await btnExcluirUsuario.click();
await page.waitForTimeout(400);
const usuarioAindaExiste = await page.evaluate(async () => {
  const mod = await import('/src/js/supabaseClient.js');
  return mod.__fixtures().usuarios.some((u) => u.id === 'u-teste-2');
});
checar(!usuarioAindaExiste, 'usuário de teste foi excluído de fato');

checar(consoleErros.length === 0, `nenhum erro não tratado no console do navegador (${consoleErros.length} encontrado(s))`);

await browser.close();
server.close();

console.log(`\n=== resumo: ${falhas === 0 ? 'tudo passou' : falhas + ' falha(s)'} ===`);
if (falhas > 0) process.exit(1);
