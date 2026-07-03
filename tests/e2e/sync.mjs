// tests/e2e/sync.mjs
//
// Mesma ideia do tests/regressao/sync.mjs: gera uma cópia local de src/ +
// index.html (código real, nunca editado direto aqui) com
// supabaseClient.js trocado pelo mock -- servida por um HTTP estático de
// verdade (ver serve.mjs) e aberta num Chromium real via Playwright.
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
copyFileSync(join(__dirname, 'mocks', 'supabaseClient.js'), join(appDir, 'src', 'js', 'supabaseClient.js'));

console.log('sync.mjs (e2e): app/ atualizado a partir de src/ + index.html reais (supabaseClient.js trocado pelo mock).');
