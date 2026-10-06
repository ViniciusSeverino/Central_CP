// src/js/renomear_anexos.js
//
// Conversão, uma vez só, dos PDFs já salvos no padrão antigo de nome
// (BSB_COND_...) para o novo (COND_BSB_..., ver nomeNovoPadrao em
// anexos_pdf.js). Roda pelo administrador em Configurações ->
// Armazenamento. Por arquivo, na ordem que não perde nada se algo falhar
// no meio:
//   1. copia para o nome novo (o original continua lá);
//   2. troca o caminho na nota (RPC renomear_anexo_nota, migration 0053)
//      -- se falhar, apaga a cópia e a nota fica como estava;
//   3. só então apaga o original -- se falhar, a nota já aponta pro novo
//      e o original fica sobrando (avisado no relatório, sem prejuízo).
// Rodar de novo é seguro: o que já está no padrão novo é ignorado.
import { nomeNovoPadrao } from './anexos_pdf.js';
import * as db from './db.js';

export function anexosNoPadraoAntigo(notas) {
  const lista = [];
  for (const n of notas || []) {
    for (const caminho of n.anexos || []) {
      const novo = nomeNovoPadrao(caminho);
      if (novo) lista.push({ notaId: n.id, antigo: caminho, novo });
    }
  }
  return lista;
}

export async function renomearAnexosPadraoAntigo(notas, aoProgredir = () => {}) {
  const pendentes = anexosNoPadraoAntigo(notas);
  const relatorio = { renomeados: 0, falhas: [], originaisSobrando: [] };
  for (let i = 0; i < pendentes.length; i++) {
    const { notaId, antigo, novo } = pendentes[i];
    try {
      await db.copiarAnexo(antigo, novo);
      try {
        await db.trocarCaminhoAnexoNota(notaId, antigo, novo);
      } catch (e) {
        try { await db.removerAnexo(novo); } catch { /* a cópia sobra, a nota segue no original */ }
        throw e;
      }
      const nota = (notas || []).find(n => n.id === notaId);
      if (nota) nota.anexos = nota.anexos.map(a => (a === antigo ? novo : a));
      relatorio.renomeados++;
      try { await db.removerAnexo(antigo); } catch { relatorio.originaisSobrando.push(antigo); }
    } catch (e) {
      relatorio.falhas.push({ caminho: antigo, erro: e.message });
    }
    aoProgredir(i + 1, pendentes.length);
  }
  return relatorio;
}
