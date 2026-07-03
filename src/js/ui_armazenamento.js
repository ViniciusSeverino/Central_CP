// src/js/ui_armazenamento.js
//
// Dashboard de armazenamento (aba Cadastros → Armazenamento, só
// administrador) — % usado de banco de dados e Storage, pra acompanhar os
// limites do plano gratuito do Supabase e saber quando vale a pena arquivar
// (ver ui_arquivos.js). Dados vêm de stats_armazenamento() (RPC), que já
// confere sozinha que quem chamou é administrador.
import { app } from './state.js';

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
    <div style="background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:18px; margin-bottom:16px;">
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
    <div style="background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:18px; margin-bottom:16px;">
      <h3 style="margin:0 0 8px;">Armazenamento (plano gratuito do Supabase)</h3>
      <p class="sub" style="margin:0 0 14px;">
        Acompanha os limites do plano gratuito — 500 MB de banco de dados e 1 GB de arquivos (Storage).
        Se o Storage estiver chegando perto do limite, use a aba "Arquivos" pra baixar em .zip e arquivar
        localmente o que já tem chamado aberto no Acelerato.
      </p>
      <button type="button" class="btn btn-ghost btn-sm" id="btn-atualizar-armazenamento">Atualizar</button>
    </div>
    ${stats ? `
      ${renderBarra('Dados (banco de dados)', stats.banco_bytes, LIMITE_BANCO_BYTES)}
      ${renderBarra('Arquivos (Storage)', stats.storage_bytes, LIMITE_STORAGE_BYTES)}
      <div class="field-hint">${stats.storage_arquivos} arquivo(s) no Storage.</div>
    ` : `<div class="empty-state">Carregando estatísticas...</div>`}
  `;
}
