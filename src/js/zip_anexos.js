// src/js/zip_anexos.js
//
// Baixa num .zip só os anexos de um grupo de notas (usado no lote "Abrir
// chamado" — o contas a pagar baixa o zip, anexa no Acelerato, e só depois
// confirma o número do chamado). Como cada nota agora tem no máximo um
// anexo (o PDF único já mesclado/renomeado, ver anexos_pdf.js), o zip é só
// juntar esses arquivos — o nome de cada um já vem no padrão da empresa.
import * as db from './db.js';

export async function baixarZipAnexosLote(notas) {
  const comAnexo = notas.filter(n => n.anexos && n.anexos.length > 0);
  if (comAnexo.length === 0) return 0;

  const JSZip = (await import('https://esm.sh/jszip@3.10.1')).default;
  const zip = new JSZip();
  for (const nota of comAnexo) {
    for (const caminho of nota.anexos) {
      const blob = await db.baixarAnexo(caminho);
      zip.file(caminho.split('/').pop(), blob);
    }
  }

  const conteudo = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(conteudo);
  const a = document.createElement('a');
  const hoje = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `central-cp-anexos-chamado-${hoje}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return comAnexo.length;
}
