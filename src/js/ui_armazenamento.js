// src/js/ui_armazenamento.js
//
// Dashboard de armazenamento (aba Cadastros → Armazenamento, só
// administrador) — % usado de banco de dados e Storage, pra acompanhar os
// limites do plano gratuito do Supabase e saber quando vale a pena arquivar
// (ver ui_arquivos.js). Dados vêm de stats_armazenamento() (RPC), que já
// confere sozinha que quem chamou é administrador.
import { app, saibaMais } from './state.js';
import { anexosNoPadraoAntigo } from './renomear_anexos.js';

// Limites do plano gratuito do Supabase — ver
// supabase.com/docs/guides/platform/billing-on-supabase (conferir de novo
// se o projeto mudar de plano).
const LIMITE_BANCO_BYTES = 500 * 1024 * 1024;
const LIMITE_STORAGE_BYTES = 1024 * 1024 * 1024;

function fmtBytes(bytes) {
  if (bytes == null) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function corBarra(pct) {
  if (pct >= 90) return 'var(--alert)';
  if (pct >= 70) return 'var(--amber)';
  return 'var(--good)';
}

function renderBarra(label, usado, limite) {
  const pct = limite > 0 ? Math.min(100, (usado / limite) * 100) : 0;
  return `
    <div class="panel">
      <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px; flex-wrap:wrap; gap:6px;">
        <strong style="font-family:'Space Grotesk',sans-serif; font-size:15px;">${label}</strong>
        <span class="mono" style="font-size:13px; color:var(--ink-soft);">${fmtBytes(usado)} de ${fmtBytes(limite)} · ${pct.toFixed(1)}%</span>
      </div>
      <div style="background:var(--gray-soft); border-radius:99px; height:10px; overflow:hidden;">
        <div style="width:${pct}%; height:100%; background:${corBarra(pct)}; border-radius:99px;"></div>
      </div>
    </div>
  `;
}

export function renderArmazenamentoTab() {
  const stats = app.armazenamentoStats;
  return `
    <div class="panel">
      <h3 class="m-0 mb-2">Armazenamento (plano gratuito do Supabase)</h3>
      ${saibaMais('Uso do banco (limite de 500 MB) e dos arquivos (limite de 1 GB) do plano gratuito.',
        'Se o Storage estiver chegando perto do limite, use "Arquivos" pra baixar em .zip e arquivar localmente o que já tem chamado aberto no Acelerato.')}
      <button type="button" class="btn btn-ghost btn-sm" id="btn-atualizar-armazenamento">Atualizar</button>
    </div>
    ${stats ? `
      ${renderBarra('Dados (banco de dados)', stats.banco_bytes, LIMITE_BANCO_BYTES)}
      ${renderBarra('Arquivos (Storage)', stats.storage_bytes, LIMITE_STORAGE_BYTES)}
      <div class="field-hint">${stats.storage_arquivos} arquivo(s) no Storage.</div>
    ` : `<div class="empty-state">Carregando estatísticas...</div>`}
    ${renderRenomearAnexos()}
  `;
}

// Conversão dos nomes antigos (BSB_COND_...) para o padrão novo
// (COND_BSB_...) -- ver renomear_anexos.js. Some quando não sobra nenhum.
function renderRenomearAnexos() {
  const r = app.state.renomearAnexos || {};
  const pendentes = anexosNoPadraoAntigo(app.notas).length;
  if (!pendentes && !r.relatorio) return '';
  return `
    <div class="panel mt-4" id="painel-renomear-anexos">
      <h3 class="m-0 mb-2">Nome dos arquivos</h3>
      ${r.relatorio ? `<p class="m-0 mb-2">${r.relatorio.renomeados} arquivo${r.relatorio.renomeados === 1 ? '' : 's'} renomeado${r.relatorio.renomeados === 1 ? '' : 's'} para o padrão novo.${r.relatorio.falhas.length ? ` ${r.relatorio.falhas.length} falharam (a nota continua com o nome antigo, pode tentar de novo).` : ''}${r.relatorio.originaisSobrando.length ? ` ${r.relatorio.originaisSobrando.length} original(is) não foram apagados (sem prejuízo: a nota já aponta pro novo).` : ''}</p>` : ''}
      ${pendentes ? `
        <p class="m-0 mb-2">${pendentes} arquivo${pendentes === 1 ? '' : 's'} ainda no padrão antigo (BSB_COND_...). O novo coloca o pagador antes: COND_BSB_...</p>
        <button type="button" class="btn btn-brand btn-sm" id="btn-renomear-anexos" ${r.rodando ? 'disabled' : ''}>${r.rodando ? `Renomeando... ${r.feitos || 0}/${pendentes + (r.feitos || 0)}` : `Renomear ${pendentes} arquivo${pendentes === 1 ? '' : 's'}`}</button>` : ''}
    </div>`;
}
