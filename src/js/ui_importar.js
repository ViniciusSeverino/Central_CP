// src/js/ui_importar.js
//
// Aba Cadastros → Importar histórico (só administrador). Três blocos:
// baixar modelo, escolher/processar planilha, e o resultado (prontas /
// avisos / erros) com o botão de confirmar — a lógica de leitura do .xlsx
// e de execução fica em events_importar.js, aqui é só a apresentação.
import { app, escapeHtml, fmtMoney, statusLabel, saibaMais } from './state.js';

function fornecedorNome(id) {
  const f = app.cadastros.fornecedores.find(f => f.id === id);
  return f ? f.nome : '—';
}

function renderResultadoImportacao(resultado) {
  const { prontas, erros, avisos } = resultado;
  return `
    <div class="panel">
      <h3 class="m-0 mb-2">Resultado da leitura</h3>
      <p class="sub m-0 mb-3">
        ${prontas.length} lançamento(s) pronto(s) pra importar · ${avisos.length} aviso(s) · ${erros.length} erro(s) bloqueando linha/grupo.
      </p>
      ${erros.length > 0 ? `
        <div class="field-hint" style="margin-bottom:6px; font-weight:600;">Erros (essas linhas/grupos não entram na importação):</div>
        <div data-tbl-fixa="importar-1" data-tbl-fixa-max="360" class="tbl-wrap tbl-fixa mb-3"><table class="data-tbl">
          <thead><tr><th>Linha(s)</th><th>Motivo</th></tr></thead>
          <tbody>${erros.map(e => `<tr><td class="mono">${escapeHtml(e.linhas)}</td><td>${escapeHtml(e.motivo)}</td></tr>`).join('')}</tbody>
        </table></div>` : ''}
      ${avisos.length > 0 ? `
        <div class="field-hint" style="margin-bottom:6px; font-weight:600;">Avisos:</div>
        <div data-tbl-fixa="importar-2" data-tbl-fixa-max="360" class="tbl-wrap tbl-fixa mb-3"><table class="data-tbl">
          <thead><tr><th>Linha(s)</th><th>Motivo</th></tr></thead>
          <tbody>${avisos.map(a => `<tr><td class="mono">${escapeHtml(a.linhas)}</td><td>${escapeHtml(a.motivo)}</td></tr>`).join('')}</tbody>
        </table></div>` : ''}
      ${prontas.length > 0 ? `
        <div class="field-hint" style="margin-bottom:6px; font-weight:600;">Prontos pra importar:</div>
        <div data-tbl-fixa="importar-3" data-tbl-fixa-max="360" class="tbl-wrap tbl-fixa mb-3"><table class="data-tbl">
          <thead><tr><th>Linha(s)</th><th>Nº NF</th><th>Fornecedor</th><th>Valor</th><th>Status</th></tr></thead>
          <tbody>${prontas.map(p => `<tr>
            <td class="mono">${escapeHtml(p._linhasPlanilha)}</td>
            <td class="mono">${escapeHtml(p.numero_nota || '—')}</td>
            <td>${escapeHtml(fornecedorNome(p.fornecedor_id))}</td>
            <td class="mono">${escapeHtml(fmtMoney(p.valor_bruto))}</td>
            <td>${escapeHtml(statusLabel(p.status))}</td>
          </tr>`).join('')}</tbody>
        </table></div>
        <button type="button" class="btn btn-brand" id="btn-confirmar-importacao">Confirmar e importar ${prontas.length} lançamento(s)</button>
      ` : `<div class="empty-state">Nenhum lançamento pronto pra importar — corrija os erros acima na planilha e processe de novo.</div>`}
    </div>
  `;
}

function renderResumoFinalImportacao(resumo) {
  return `
    <div class="panel">
      <h3 class="m-0 mb-2">Importação concluída</h3>
      <p class="sub m-0 mb-3">
        ${resumo.importadas} lançamento(s) importado(s) com sucesso${resumo.falhas.length > 0 ? ` · ${resumo.falhas.length} falharam` : ''}.
      </p>
      ${resumo.falhas.length > 0 ? `
        <div data-tbl-fixa="importar-4" data-tbl-fixa-max="360" class="tbl-wrap tbl-fixa mb-3"><table class="data-tbl">
          <thead><tr><th>Linha(s)</th><th>Motivo</th></tr></thead>
          <tbody>${resumo.falhas.map(f => `<tr><td class="mono">${escapeHtml(f.linhas)}</td><td>${escapeHtml(f.motivo)}</td></tr>`).join('')}</tbody>
        </table></div>` : ''}
    </div>
  `;
}

export function renderImportarTab() {
  const st = app.importar;
  return `
    <div class="panel">
      <h3 class="m-0 mb-2">Importar histórico</h3>
      ${saibaMais('Cria lançamentos a partir de uma planilha no formato do modelo abaixo.',
        `O formato é o mesmo da aba "Notas" do Exportar Excel (dá pra reaproveitar uma exportação já feita). Cada lançamento fica registrado como criado por você — o nome de quem solicitou de fato, quando preenchido, fica guardado como referência histórica (não aponta pra uma conta de usuário de verdade). Linhas com o mesmo Nº NF + Fornecedor viram uma nota só, rateada entre os centros de custo de cada linha. Campos em branco na planilha ficam em branco na nota — normal pra dado antigo sem controle completo.`)}
      <button type="button" class="btn btn-ghost btn-sm" id="btn-baixar-modelo-importacao">Baixar modelo (.xlsx)</button>
    </div>
    <div class="panel">
      <div class="field"><label>Planilha preenchida</label><input type="file" id="importar-arquivo" accept=".xlsx"></div>
      <button type="button" class="btn btn-brand btn-sm" id="btn-processar-importacao">Processar planilha</button>
    </div>
    ${st.resultado ? renderResultadoImportacao(st.resultado) : ''}
    ${st.resumoFinal ? renderResumoFinalImportacao(st.resumoFinal) : ''}
  `;
}
