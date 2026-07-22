// Pré-visualização de anexos no formulário de nota (pedido do dono do
// produto): o vão vazio ao lado do formulário (antes só com o painel
// "Ensinar o leitor") ganhou também a imagem/PDF de verdade -- dá pra
// conferir o documento sem sair do app, além de ser o mesmo material que
// pode ajudar a treinar o OCR no futuro (ver leitor_documentos.js).
//
// URL.createObjectURL não existe no jsdom -- por isso um anexo NOVO aqui
// sempre cai no "não disponível" (o guard em ui_nota.js evita lançar
// erro), mas a estrutura (card, título, uma seção por arquivo) é a mesma
// testável; o preview de verdade (imagem/iframe renderizando) só dá pra
// confirmar num navegador real (ver tests/e2e). Anexo JÁ SALVO usa
// createSignedUrl (mock suporta), então esse caminho testa de ponta a
// ponta, inclusive o <img>/<iframe> resultante.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

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
const cards = document.querySelectorAll('.preview-anexos .preview-card');
checarIgual(cards.length, 2, 'um card de pré-visualização por anexo novo');
checar(document.body.textContent.includes('novo, ainda não enviado'), 'indica que o anexo novo ainda não foi enviado');

document.getElementById('modal-close').click();
await new Promise(r => setTimeout(r, 100));

// Anexo já salvo (nota existente sendo corrigida/completada): mostra
// "Visualizar" em vez de já vir carregado -- URL assinada expira e cada
// carregamento é uma chamada ao Storage, não vale pré-buscar todas de
// uma vez (ver bind em events_notas.js).
document.querySelector('[data-view="recebidos"]').click();
await new Promise(r => setTimeout(r, 100));
const notaRecebida = document.querySelector('[data-open]');
checar(!!notaRecebida, 'existe alguma nota "recebido" no fixture pra abrir');
notaRecebida.click();
await new Promise(r => setTimeout(r, 100));
document.querySelector('[data-action="completar_recebimento"]').click();
await new Promise(r => setTimeout(r, 100));

const btnVisualizar = document.querySelector('[data-carregar-preview]');
checar(!!btnVisualizar, 'anexo já salvo mostra o botão "Visualizar"');
btnVisualizar.click();
await new Promise(r => setTimeout(r, 100));
const preview = document.querySelector('.preview-card img, .preview-card iframe');
checar(!!preview, 'depois de clicar em "Visualizar", o preview de verdade aparece (img ou iframe)');
checar(preview.getAttribute('src').includes('signed=1'), 'o preview usa a URL assinada do Storage -- veio ' + preview.getAttribute('src'));

// Tela cheia com zoom (pedido do dono do produto): o overlay fica fora de
// #app (ver index.html), então precisa existir independente do que está
// dentro do modal. Esse anexo (boleto.pdf) é PDF -- os controles de zoom
// manual só valem pra imagem (PDF usa o visualizador nativo).
checar(!!document.getElementById('preview-lightbox'), 'overlay de tela cheia existe na página (fora de #app)');
const btnExpandir = document.querySelector('[data-expandir-preview]');
checar(!!btnExpandir, 'card do anexo mostra o botão "Tela cheia"');
btnExpandir.click();
await new Promise(r => setTimeout(r, 50));
const lightbox = document.getElementById('preview-lightbox');
checar(!lightbox.hidden, 'clicar em "Tela cheia" abre o overlay');
const previewGrande = document.querySelector('#preview-lightbox-corpo iframe');
checar(!!previewGrande, 'overlay mostra o mesmo PDF em tamanho maior');
checar(previewGrande.getAttribute('src').includes('signed=1'), 'overlay usa a mesma URL assinada');
checarIgual(document.getElementById('preview-lightbox-zoom-controles').style.display, 'none', 'controles de zoom manual ficam escondidos pra PDF (usa o zoom nativo do navegador)');
document.getElementById('preview-lightbox-fechar').click();
await new Promise(r => setTimeout(r, 50));
checar(lightbox.hidden, 'botão "Fechar" fecha o overlay de novo');

checarSemErrosNaoTratados(erros, 'preview_anexos');
relatorioFinal('preview_anexos');
