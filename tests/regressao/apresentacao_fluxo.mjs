// Aba "Apresentação do fluxo" (só administrador): a apresentação animada
// do fluxo de NFs, aberta num iframe (src/apresentacao/fluxo-nf.html). A
// animação em si roda num navegador de verdade em
// tests/e2e/apresentacao_fluxo.mjs -- aqui fica quem vê a aba e o que ela
// carrega.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('### quem vê a aba ###');
const { document, erros } = await bootApp(PERFIS.administrador);
checar(!!document.querySelector('[data-view="apresentacao"]'), 'administrador vê "Apresentação do fluxo" no menu');
const { app } = await import('./app/src/js/state.js');
const { navItemsFor } = await import('./app/src/js/ui.js');
const papeisAdmin = app.papeisEfetivos;
for (const papel of ['gerente_financeiro', 'contas_a_pagar', 'departamento']) {
  app.papeisEfetivos = [papel];
  checar(!navItemsFor({ ...app.usuario, role: papel }).some(i => i.key === 'apresentacao'), `${papel} NÃO vê "Apresentação do fluxo"`);
}
app.papeisEfetivos = papeisAdmin;

console.log('\n### a aba ###');
document.querySelector('[data-view="apresentacao"]').click();
await new Promise(r => setTimeout(r, 50));
const quadro = document.querySelector('iframe.apresentacao-quadro');
checar(!!quadro && quadro.getAttribute('src') === 'src/apresentacao/fluxo-nf.html', 'abre a apresentação num iframe');
checar(!!quadro && /fullscreen/.test(quadro.getAttribute('allow') || ''), 'o iframe permite tela cheia (botão "Tela cheia" de dentro da apresentação)');
checar(!!document.querySelector('a[href="src/apresentacao/fluxo-nf.html"][target="_blank"]'), 'link "Abrir em nova aba"');
checar(existsSync(join(__dirname, 'app', 'src', 'apresentacao', 'fluxo-nf.html')), 'o arquivo da apresentação existe');

checarSemErrosNaoTratados(erros, 'apresentacao_fluxo');
relatorioFinal('apresentacao_fluxo');
