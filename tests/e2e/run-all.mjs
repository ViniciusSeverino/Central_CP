// tests/e2e/run-all.mjs
//
// Roda todo *.mjs de teste desta pasta (hoje só pdf_zip_excel.mjs, mas
// deixa a porta aberta pra outros cenários de navegador real no futuro).
// Cada arquivo já faz sua própria sincronização (sync.mjs) e sobe/derruba
// seu próprio Chromium -- aqui só agrega o resultado final.
import { execFileSync } from 'child_process';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const arquivos = readdirSync(__dirname)
  .filter(f => f.endsWith('.mjs') && f !== 'run-all.mjs' && f !== 'sync.mjs' && f !== 'serve.mjs')
  .sort();

console.log(`=== rodando ${arquivos.length} teste(s) e2e (Chromium real) ===\n`);

const resultados = [];
for (const arquivo of arquivos) {
  console.log(`--- ${arquivo} ---`);
  try {
    execFileSync('node', [arquivo], { cwd: __dirname, stdio: 'inherit' });
    resultados.push({ arquivo, ok: true });
  } catch {
    resultados.push({ arquivo, ok: false });
  }
  console.log();
}

const falharam = resultados.filter(r => !r.ok);
console.log(`=== resumo: ${resultados.length - falharam.length}/${resultados.length} arquivo(s) passaram ===`);
if (falharam.length > 0) {
  console.log('arquivos com falha:', falharam.map(r => r.arquivo).join(', '));
  process.exitCode = 1;
}
