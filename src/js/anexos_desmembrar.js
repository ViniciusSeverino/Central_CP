// src/js/anexos_desmembrar.js
//
// Correção de um lançamento (corrigir pendência, editar e reenviar,
// corrigir recebimento): o anexo salvo é UM PDF com tudo mesclado (ver
// finalizarAnexos em events_notas.js). Pra quem corrige poder reordenar,
// substituir ou tirar só uma página, ao abrir a correção o PDF é baixado
// e dividido em páginas (dividirPdfEmPaginas), que entram na mesma lista
// dos anexos novos -- com as mesmas setas/remover de sempre, mais
// "substituir". O arquivo salvo vai pra app.anexosRemovidos; ao salvar,
// finalizarAnexos junta as páginas de novo na ordem da lista.
//
// Se o download ou a divisão falhar (rede, PDF protegido...), nada muda:
// o anexo continua inteiro, como era antes desta funcionalidade.
import { app } from './state.js';
import * as db from './db.js';

export const MODAIS_COM_DESMEMBRAMENTO = ['corrigir_pendencia', 'editar_reenviar', 'corrigir_recebimento'];

// Chamado pelo handler do modal (events_notas.js / events_recebimento.js)
// logo depois de abrir a correção -- uma vez só por abertura (flag
// app.desmembrarAoAbrir, ligada no clique da ação).
export function talvezDesmembrar(aoTerminar) {
  const id = app.desmembrarAoAbrir;
  if (!id || app.state.modalData !== id || !MODAIS_COM_DESMEMBRAMENTO.includes(app.state.modal)) return;
  app.desmembrarAoAbrir = null;
  const n = app.notas.find(x => x.id === id);
  if (!n) return;
  desmembrarAnexosSalvos(n).then(aoTerminar, aoTerminar);
}

export async function desmembrarAnexosSalvos(n, dividir) {
  const pdfs = (n.anexos || []).filter(p => /\.pdf$/i.test(p) && !app.anexosRemovidos.includes(p));
  if (!pdfs.length) return false;
  const modal = app.state.modal;
  app.anexosDesmembrando = true;
  try {
    const dividirPdf = dividir || (await import('./anexos_pdf.js')).dividirPdfEmPaginas;
    const paginas = [];
    for (const caminho of pdfs) paginas.push(...await dividirPdf(await db.baixarAnexo(caminho)));
    // A pessoa pode ter fechado/trocado de tela enquanto baixava.
    if (app.state.modal !== modal || app.state.modalData !== n.id || !paginas.length) return false;
    app.anexosNovos = [...paginas, ...app.anexosNovos];
    // Páginas do anexo já salvo não passam pelo leitor de documentos de
    // novo (já foram conferidas no lançamento, e a leitura poderia
    // sobrescrever campos já corrigidos) -- só os arquivos novos são lidos.
    app.anexosAnalises = [...paginas.map(() => ({ status: 'original', resultado: null, respondido: [] })), ...app.anexosAnalises];
    app.anexosRemovidos.push(...pdfs);
    return true;
  } catch {
    return false;
  } finally {
    app.anexosDesmembrando = false;
  }
}

// "Substituir" de um item da lista: um seletor de arquivo escondido,
// reaproveitado por todos os itens (data-substituir-anexo-novo = índice).
export function bindSubstituirAnexo(aoSubstituir) {
  const input = document.getElementById('nf-anexo-substituto');
  if (!input) return;
  document.querySelectorAll('[data-substituir-anexo-novo]').forEach(a => {
    a.onclick = (e) => { e.preventDefault(); input.dataset.indice = a.dataset.substituirAnexoNovo; input.value = ''; input.click(); };
  });
  input.onchange = () => {
    const arquivo = input.files && input.files[0];
    const i = Number(input.dataset.indice);
    if (!arquivo || !(i >= 0 && i < app.anexosNovos.length)) return;
    app.anexosNovos[i] = arquivo;
    app.anexosAnalises[i] = undefined;
    aoSubstituir(i);
  };
}

// Miniaturas das páginas (pdf.js, sob demanda; guardadas no próprio File
// pra não redesenhar a cada refresh da lista).
export async function preencherMiniaturas() {
  const alvos = Array.from(document.querySelectorAll('[data-miniatura]'));
  for (const el of alvos) {
    const arquivo = app.anexosNovos[Number(el.dataset.miniatura)];
    if (!arquivo) continue;
    try {
      if (!arquivo._miniatura) {
        const { miniaturaPaginaPdf } = await import('./pdf_render.js');
        arquivo._miniatura = await miniaturaPaginaPdf(arquivo, 1, 96);
      }
      if (el.isConnected) el.innerHTML = `<img src="${arquivo._miniatura}" alt="">`;
    } catch { /* sem miniatura: fica o ícone */ }
  }
}
