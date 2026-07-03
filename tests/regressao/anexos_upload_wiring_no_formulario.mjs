// Anexar PDF no formulário de nota: o input de arquivo múltiplo funciona,
// mostra a lista de anexos "novos" antes de salvar, e dá pra remover um
// antes de enviar.
//
// A mesclagem de PDF de verdade (anexos_pdf.js) usa import de CDN
// (`https://esm.sh/pdf-lib`), que o carregador padrão de módulos do Node
// recusa (não é falha de rede, é o Node que não importa URL https:// por
// padrão) -- isso SÓ acontece neste ambiente de teste; num navegador de
// verdade funciona nativamente. A prova de que o merge funciona de
// verdade fica com tests/e2e (Playwright, navegador real) -- aqui só
// testamos a wiring do formulário e que o erro é tratado (toast), sem crash.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros } = await bootApp(PERFIS.departamento);
global.File = dom.window.File;

document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));

const input = document.getElementById('nf-anexos-input');
checar(!!input, 'input de anexos existe no formulário');

const f1 = new dom.window.File(['conteudo-pdf-fake'], 'boleto.pdf', { type: 'application/pdf' });
const f2 = new dom.window.File(['conteudo-pdf-fake-2'], 'nota-fiscal.pdf', { type: 'application/pdf' });
Object.defineProperty(input, 'files', { value: [f1, f2], configurable: true });
input.dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
checar(document.querySelectorAll('#anexos-area em').length === 2, 'anexar 2 arquivos mostra 2 itens "novo" na lista, antes de salvar');

const btnRemover = document.querySelector('#anexos-area [data-remover-anexo-novo]');
if (btnRemover) {
  btnRemover.click();
  await new Promise(r => setTimeout(r, 30));
  checar(document.querySelectorAll('#anexos-area em').length === 1, 'remover 1 anexo novo antes de salvar tira ele da lista');
} else {
  checar(false, 'botão de remover anexo novo deveria existir na lista');
}

checarSemErrosNaoTratados(erros, 'anexos_upload_wiring_no_formulario');
relatorioFinal('anexos_upload_wiring_no_formulario');
