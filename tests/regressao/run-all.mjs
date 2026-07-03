// tests/regressao/run-all.mjs
//
// Orquestrador: sincroniza app/ a partir do código real (sync.mjs), acha
// todos os *.mjs de teste nesta pasta (menos ele mesmo e o próprio
// sync.mjs) e roda cada um num processo Node separado -- um processo por
// arquivo, porque cada um simula uma sessão de login e o Node cacheia
// módulos ES com estado global entre imports no MESMO processo (sessões
// vazariam uma na outra se rodassem juntas). Sai com código != 0 se
// qualquer teste falhar -- é isso que o GitHub Actions usa pra barrar um PR.
import { execFileSync } from 'child_process';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('=== sincronizando app/ a partir do código real (src/ + index.html) ===');
execFileSync('node', ['sync.mjs'], { cwd: __dirname, stdio: 'inherit' });

const arquivos = readdirSync(__dirname)
  .filter(f => f.endsWith('.mjs') && f !== 'run-all.mjs' && f !== 'sync.mjs')
  .sort();

console.log(`\n=== rodando ${arquivos.length} arquivo(s) de teste ===\n`);

const resultados = [];
for (const arquivo of arquivos) {
  process.stdout.write(`--- ${arquivo} `);
  try {
    const saida = execFileSync('node', [arquivo], { cwd: __dirname, encoding: 'utf8' });
    console.log('OK');
    resultados.push({ arquivo, ok: true, saida });
  } catch (e) {
    console.log('FALHOU');
    resultados.push({ arquivo, ok: false, saida: (e.stdout || '') + (e.stderr || '') });
  }
}

const falharam = resultados.filter(r => !r.ok);

console.log('\n=== detalhe das falhas ===');
if (falharam.length === 0) {
  console.log('(nenhuma)');
} else {
  falharam.forEach(r => {
    console.log(`\n>>> ${r.arquivo}`);
    console.log(r.saida);
  });
}

console.log(`\n=== resumo: ${resultados.length - falharam.length}/${resultados.length} arquivo(s) passaram ===`);
if (falharam.length > 0) {
  console.log('arquivos com falha:', falharam.map(r => r.arquivo).join(', '));
  process.exitCode = 1;
}
