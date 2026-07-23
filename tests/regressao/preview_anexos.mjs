// Pré-visualização de anexos no formulário de nota (pedido do dono do
// produto): o documento em si (imagem/PDF de verdade) só é mostrado numa
// janela externa, num segundo monitor -- o formulário mostra só o botão
// "Abrir pré-visualização" no lugar (o vão ao lado do formulário não
// aproveita bem o espaço pra isso). Os cards de anexo (título, zoom,
// "Visualizar") vivem em ui_nota.js/renderPreviewAnexosConteudo() e só são
// montados de verdade dentro da janela externa (ver
// renderizarConteudoJanelaExterna em events_notas.js).
//
// jsdom não implementa window.open() de verdade (retorna undefined) --
// por isso, aqui, clicar no botão sempre cai no aviso de "bloqueou o
// pop-up", sem nunca chegar a montar os cards. O conteúdo de verdade
// dentro da janela (zoom inline, "Visualizar" com URL assinada) só dá pra
// confirmar num navegador real (ver tests/e2e).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros } = await bootApp(PERFIS.departamento);
global.File = dom.window.File;

document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));

checar(!document.querySelector('.preview-anexos'), 'sem nenhum anexo ainda, não mostra o painel de pré-visualização');

const input = document.getElementById('nf-anexos-input');
const pdf = new dom.window.File(['a'], 'nota-fiscal.pdf', { type: 'application/pdf' });
const foto = new dom.window.File(['b'], 'boleto.jpg', { type: 'image/jpeg' });
Object.defineProperty(input, 'files', { value: [pdf, foto], configurable: true });
input.dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));

checar(!!document.querySelector('.preview-anexos'), 'com anexos novos, o painel de pré-visualização aparece');
checar(!document.querySelector('.preview-anexos .preview-card'), 'o formulário NÃO mostra os cards de anexo (só existem na janela externa)');
const btnAbrir = document.querySelector('[data-abrir-preview-externo]');
checar(!!btnAbrir, 'painel mostra o botão "Abrir pré-visualização"');
checar(btnAbrir.textContent.includes('Abrir pré-visualização'), 'botão tem o texto certo -- veio "' + btnAbrir.textContent.trim() + '"');

// jsdom: window.open() retorna undefined (não implementado) -- o clique
// deve cair no aviso de bloqueio, sem quebrar nada e sem trocar o painel
// pro estado "aberta em outra janela" (já que ela nunca abriu de verdade).
btnAbrir.click();
await new Promise(r => setTimeout(r, 100));
checar(!document.querySelector('.preview-externo-aviso'), 'sem suporte real a pop-up (jsdom), o painel continua mostrando o botão de abrir');
checar(document.body.textContent.includes('bloqueou'), 'mostra um aviso explicando que o navegador bloqueou a nova janela');
checar(!!document.querySelector('[data-abrir-preview-externo]'), 'o botão "Abrir pré-visualização" continua lá depois do aviso');

document.getElementById('modal-close').click();
await new Promise(r => setTimeout(r, 100));

// Anexo já salvo (nota existente sendo corrigida/completada): o painel
// continua sendo só o botão -- "Visualizar" (carregamento sob demanda da
// URL assinada) só aparece dentro da janela externa agora.
document.querySelector('[data-view="recebidos"]').click();
await new Promise(r => setTimeout(r, 100));
const notaRecebida = document.querySelector('[data-open]');
checar(!!notaRecebida, 'existe alguma nota "recebido" no fixture pra abrir');
notaRecebida.click();
await new Promise(r => setTimeout(r, 100));
document.querySelector('[data-action="completar_recebimento"]').click();
await new Promise(r => setTimeout(r, 100));

checar(!!document.querySelector('.preview-anexos'), 'nota com anexo já salvo também mostra o painel de pré-visualização');
checar(!document.querySelector('[data-carregar-preview]'), 'botão "Visualizar" não aparece no formulário (só dentro da janela externa)');
checar(!!document.querySelector('[data-abrir-preview-externo]'), 'mostra o botão "Abrir pré-visualização" pra esse anexo também');

checarSemErrosNaoTratados(erros, 'preview_anexos');
relatorioFinal('preview_anexos');
