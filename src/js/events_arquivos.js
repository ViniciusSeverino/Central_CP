// src/js/events_arquivos.js — aba Cadastros → Arquivos (administrador + contas a pagar)
import { app } from './state.js';
import * as db from './db.js';
import { render } from './app.js';
import { showToast } from './toast.js';
import { notasDoGrupo } from './ui_arquivos.js';

export function attachArquivosHandlers() {
  document.querySelectorAll('[data-baixar-zip-arquivo]').forEach(b => {
    b.onclick = async () => {
      const key = b.dataset.baixarZipArquivo;
      const grupo = notasDoGrupo(key);
      if (!grupo) return;
      const original = b.textContent;
      b.disabled = true; b.textContent = 'Gerando zip...';
      try {
        const { baixarZipAnexosLote } = await import('./zip_anexos.js');
        const qtd = await baixarZipAnexosLote(grupo.notas);
        if (qtd === 0) { showToast('Nenhuma dessas notas tem anexo salvo.'); return; }
        app.gruposArquivadosProntos.add(key);
        render();
      } catch (e) {
        showToast('Erro ao gerar o zip: ' + e.message);
      } finally {
        b.disabled = false; b.textContent = original;
      }
    };
  });

  document.querySelectorAll('[data-confirmar-arquivar]').forEach(b => {
    b.onclick = async () => {
      const key = b.dataset.confirmarArquivar;
      const grupo = notasDoGrupo(key);
      if (!grupo) return;
      if (!confirm(`Confirma que já salvou o .zip na rede local? Isso vai apagar ${grupo.notas.length} arquivo(s) do Storage do Supabase — o registro da nota continua, só o arquivo some (fica "Arquivado localmente" no detalhe).`)) return;
      const original = b.textContent;
      b.disabled = true; b.textContent = 'Arquivando...';
      try {
        await db.arquivarAnexosNotas(grupo.notas.map(n => n.id));
        app.gruposArquivadosProntos.delete(key);
        app.notas = await db.carregarNotas();
        app.state.flash = `${grupo.notas.length} anexo(s) arquivado(s) e removido(s) do Storage.`;
        render();
      } catch (e) {
        showToast('Erro ao arquivar: ' + e.message);
        b.disabled = false; b.textContent = original;
      }
    };
  });
}
