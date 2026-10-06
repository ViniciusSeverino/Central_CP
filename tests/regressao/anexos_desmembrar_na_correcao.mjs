// Correção de lançamento (ver anexos_desmembrar.js): o PDF salvo (tudo
// mesclado) é separado em páginas, que entram na lista de anexos com
// reordenar/substituir/remover; o arquivo salvo vai pra anexosRemovidos e
// é remontado ao salvar. Se a divisão falhar, o anexo fica inteiro.
// O Node não importa o pdf-lib do esm.sh -- a divisão de verdade é
// conferida no e2e (tests/e2e/anexo_desmembrar_correcao.mjs); aqui ela é
// simulada passando um `dividir` falso.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros } = await bootApp(PERFIS.administrador);
const { app } = await import('./app/src/js/state.js');
const { render } = await import('./app/src/js/app.js');
const { desmembrarAnexosSalvos } = await import('./app/src/js/anexos_desmembrar.js');
const esperar = (ms) => new Promise(r => setTimeout(r, ms));
const CAMINHO = 'nota-5/BSB_COND_01-06_FORNECEDOR_4_NF5_BOLETO.pdf';

function abrirCorrecao() {
  app.anexosNovos = []; app.anexosRemovidos = []; app.anexosAnalises = [];
  app.state.modal = 'corrigir_pendencia'; app.state.modalData = 'nota-5';
  app.desmembrarAoAbrir = 'nota-5';
  render();
}

console.log('### Divisão falhou: anexo continua inteiro ###');
abrirCorrecao();
for (let i = 0; i < 40 && app.anexosDesmembrando !== false; i++) await esperar(25);
await esperar(30);
checar(!!document.querySelector(`[data-remover-anexo="${CAMINHO}"]`), 'sem conseguir dividir, o anexo salvo continua na lista, inteiro');
checarIgual(app.anexosRemovidos.length, 0, 'e nada foi marcado pra remoção');

console.log('### Divisão em páginas ###');
abrirCorrecao();
app.desmembrarAoAbrir = null;
const paginaFalsa = (n) => { const f = new dom.window.File([`pagina-${n}`], `Página ${n} de 3.pdf`, { type: 'application/pdf' }); f._paginaOriginal = n; f._totalPaginas = 3; return f; };
const nota5 = app.notas.find(n => n.id === 'nota-5');
const ok = await desmembrarAnexosSalvos(nota5, async () => [paginaFalsa(1), paginaFalsa(2), paginaFalsa(3)]);
render();
await esperar(30);
checar(ok, 'divisão concluída');
checarIgual(document.querySelectorAll('.anexos-lista li.anexo-pagina').length, 3, 'as 3 páginas aparecem na lista, cada uma com miniatura');
checar(!document.querySelector(`[data-remover-anexo="${CAMINHO}"]`) && app.anexosRemovidos.includes(CAMINHO), 'o arquivo salvo sai da lista (vai ser remontado ao salvar)');
checarIgual(app.anexosAnalises.map(a => a.status), ['original', 'original', 'original'], 'páginas originais não passam de novo pelo leitor de documentos');
checarIgual(document.querySelectorAll('[data-substituir-anexo-novo]').length, 3, 'toda página tem "substituir"');

console.log('### Remover, reordenar e substituir ###');
document.querySelector('[data-remover-anexo-novo="1"]').click();
await esperar(20);
document.querySelector('[data-mover-anexo-novo="1"][data-direcao="cima"]').click();
await esperar(20);
checarIgual(app.anexosNovos.map(f => f._paginaOriginal), [3, 1], 'tirou a página 2 e subiu a 3: ordem final 3, 1');
checarIgual(app.anexosAnalises.length, 2, 'análises continuam alinhadas com os arquivos');

const novo = new dom.window.File(['boleto-novo'], 'boleto-corrigido.pdf', { type: 'application/pdf' });
const input = document.getElementById('nf-anexo-substituto');
document.querySelector('[data-substituir-anexo-novo="1"]').click();
Object.defineProperty(input, 'files', { value: [novo], configurable: true });
input.dispatchEvent(new dom.window.Event('change'));
await esperar(30);
checar(app.anexosNovos[1] === novo && app.anexosNovos[0]._paginaOriginal === 3, 'substituir troca só aquela página, no mesmo lugar');

checarSemErrosNaoTratados(erros, 'anexos_desmembrar_na_correcao');
relatorioFinal('anexos_desmembrar_na_correcao');
