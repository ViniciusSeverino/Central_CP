// Organizar a ordem dos anexos "novos" (quando mais de um) antes de
// salvar -- a ordem da lista é a ordem final das páginas no PDF único
// mesclado (ver finalizarAnexos em events_notas.js). anexosAnalises é um
// array paralelo (mesmo índice) e precisa mover junto.
//
// Mesma limitação de escapeHtml() no jsdom documentada em
// anexos_upload_wiring_no_formulario.mjs -- por isso a checagem de ordem
// lê app.anexosNovos direto (via import do módulo de estado), não o texto
// exibido na tela.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros } = await bootApp(PERFIS.departamento);
global.File = dom.window.File;
const { app } = await import('./app/src/js/state.js');

document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));

const input = document.getElementById('nf-anexos-input');
const f1 = new dom.window.File(['a'], 'primeiro.pdf', { type: 'application/pdf' });
const f2 = new dom.window.File(['b'], 'segundo.pdf', { type: 'application/pdf' });
const f3 = new dom.window.File(['c'], 'terceiro.pdf', { type: 'application/pdf' });
Object.defineProperty(input, 'files', { value: [f1, f2, f3], configurable: true });
input.dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));

// Marca uma "análise" fake em cada índice, só pra confirmar que ela viaja
// junto quando o arquivo muda de posição (mesmo índice = mesmo arquivo).
app.anexosAnalises[0] = { status: 'pronto', resultado: { marca: 'primeiro' } };
app.anexosAnalises[1] = { status: 'pronto', resultado: { marca: 'segundo' } };
app.anexosAnalises[2] = { status: 'pronto', resultado: { marca: 'terceiro' } };

checarIgual(app.anexosNovos.map(f => f.name).join(','), 'primeiro.pdf,segundo.pdf,terceiro.pdf', 'ordem inicial é a ordem em que os arquivos foram escolhidos');
checar(!document.querySelector('[data-mover-anexo-novo="0"][data-direcao="cima"]'), 'primeiro item da lista não tem seta "mover para cima" (já está no topo)');
checar(!document.querySelector('[data-mover-anexo-novo="2"][data-direcao="baixo"]'), 'último item da lista não tem seta "mover para baixo" (já está no fim)');

// Move o "segundo.pdf" (índice 1) pra cima -> vira primeiro.pdf, segundo.pdf(era 1º), terceiro.pdf
document.querySelector('[data-mover-anexo-novo="1"][data-direcao="cima"]').click();
await new Promise(r => setTimeout(r, 50));
checarIgual(app.anexosNovos.map(f => f.name).join(','), 'segundo.pdf,primeiro.pdf,terceiro.pdf', 'mover o 2º item pra cima troca ele de lugar com o 1º');
checarIgual(app.anexosAnalises.map(a => a.resultado.marca).join(','), 'segundo,primeiro,terceiro', 'a análise (leitor de documentos) viaja junto com o arquivo ao reordenar');

// Move o "terceiro.pdf" (agora índice 2) pra cima -> fica no meio
document.querySelector('[data-mover-anexo-novo="2"][data-direcao="cima"]').click();
await new Promise(r => setTimeout(r, 50));
checarIgual(app.anexosNovos.map(f => f.name).join(','), 'segundo.pdf,terceiro.pdf,primeiro.pdf', 'mover o último item pra cima o traz pro meio da lista');

checarSemErrosNaoTratados(erros, 'anexos_reordenar');
relatorioFinal('anexos_reordenar');
