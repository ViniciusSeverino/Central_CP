// tests/regressao/sync.mjs
//
// Os drivers rodam contra uma cópia local de src/ (pra poder trocar só
// supabaseClient.js pelo mock, sem precisar de um banco de verdade nem de
// segredo nenhum). Este script gera essa cópia a partir do código REAL do
// app (nunca o contrário) -- roda antes de cada execução da suíte
// (ver run-all.mjs), então nunca fica desatualizada.
import { cpSync, copyFileSync, mkdirSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const appDir = join(__dirname, 'app');

rmSync(appDir, { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });

cpSync(join(repoRoot, 'src'), join(appDir, 'src'), { recursive: true });
copyFileSync(join(repoRoot, 'index.html'), join(appDir, 'index.html'));

// Único arquivo que NÃO é o real: supabaseClient.js vira o mock, com
// fixtures em memória em vez de bater num Supabase de verdade.
copyFileSync(join(__dirname, 'mocks', 'supabaseClient.js'), join(appDir, 'src', 'js', 'supabaseClient.js'));

console.log('sync.mjs: app/ atualizado a partir de src/ + index.html reais (supabaseClient.js trocado pelo mock).');
