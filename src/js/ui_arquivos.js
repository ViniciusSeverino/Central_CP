// src/js/ui_arquivos.js
//
// Aba Cadastros → Arquivos (administrador + contas a pagar) — agrupa notas
// elegíveis pra arquivar (já têm chamado aberto no Acelerato, ainda têm
// anexo, ainda não foram arquivadas) por pagador + tipo de nota
// (classificacao), pra baixar um .zip por grupo e depois confirmar a
// remoção do Storage (ver events_arquivos.js e db.arquivarAnexosNotas()).
import { app, escapeHtml, labelOf } from './state.js';

const TIPO_LABEL = { Compras: 'Nota de Compra', Serviço: 'Nota de Serviço', Outros: 'Outros' };

function tipoDeNota(classificacao) {
  return TIPO_LABEL[classificacao] || 'Outros';
}

// Elegível: já tem chamado aberto (o banco também garante isso — trigger
// bloquear_arquivamento_sem_chamado), ainda tem anexo de verdade, e ainda
// não foi arquivada.
function notasElegiveis() {
  return app.notas.filter(n => n.numero_chamado && !n.anexo_arquivado_em && n.anexos && n.anexos.length > 0);
}

function agruparPorPagadorTipo(notas) {
  const grupos = new Map();
  notas.forEach(n => {
    const tipo = tipoDeNota(n.classificacao);
    const key = `${n.pagador_id || 'sem-pagador'}|${tipo}`;
    if (!grupos.has(key)) grupos.set(key, { key, pagador_id: n.pagador_id, tipo, notas: [] });
    grupos.get(key).notas.push(n);
  });
  return Array.from(grupos.values()).sort((a, b) => a.tipo.localeCompare(b.tipo));
}

// Reaproveitado por events_arquivos.js pra reconstruir a lista de notas de
// um grupo a partir só da key (pagador_id|tipo) — recalcula na hora, não
// precisa guardar em nenhum outro lugar.
export function notasDoGrupo(key) {
  return agruparPorPagadorTipo(notasElegiveis()).find(g => g.key === key);
}

function renderGrupo(g) {
  const pagador = app.cadastros.pagadores.find(p => p.id === g.pagador_id);
  const pronto = app.gruposArquivadosProntos.has(g.key);
  return `
  <div class="grupo-card">
    <div class="grupo-header">
      <div>
        <div class="grupo-title">${escapeHtml(pagador ? labelOf(pagador) : 'Sem pagador')} · ${escapeHtml(g.tipo)}</div>
        <div class="grupo-sub">${g.notas.length} nota(s) com anexo, pronta(s) pra arquivar</div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button type="button" class="btn btn-ghost btn-sm" data-baixar-zip-arquivo="${g.key}">Baixar ZIP</button>
        ${pronto ? `<button type="button" class="btn btn-alert btn-sm" data-confirmar-arquivar="${g.key}">Confirmar e apagar do Storage</button>` : ''}
      </div>
    </div>
  </div>`;
}

export function renderArquivosTab() {
  const grupos = agruparPorPagadorTipo(notasElegiveis());
  return `
    <div style="background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:18px; margin-bottom:16px;">
      <h3 style="margin:0 0 8px;">Arquivos</h3>
      <p class="sub" style="margin:0;">
        Notas com chamado já aberto no Acelerato, agrupadas por pagador e tipo de nota. Baixe o .zip de um
        grupo, salve na rede local da empresa e confirme pra liberar espaço no Storage do Supabase — o
        registro da nota continua, só o arquivo some daqui (fica marcado como "Arquivado localmente" no
        detalhe da nota). Documentos de processos ainda ativos (sem chamado aberto) não aparecem aqui.
      </p>
    </div>
    ${grupos.length === 0 ? `<div class="empty-state">Nenhum grupo elegível pra arquivar no momento.</div>` : `
    <div class="card-list">${grupos.map(renderGrupo).join('')}</div>`}
  `;
}
