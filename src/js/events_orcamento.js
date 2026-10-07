// src/js/events_orcamento.js -- Configurações › Orçamento (ver ui_orcamento.js).
import { app } from './state.js';
import { render } from './app.js';
import { showToast } from './toast.js';
import * as db from './db.js';
import { interpretarOrcamento } from './orcamento.js';
import { interpretarRelatorioGroup } from './group_importacao.js';

function valorDaCelula(cell) {
  let v = cell.value;
  if (v && typeof v === 'object' && 'result' in v) v = v.result; // fórmula
  if (v && typeof v === 'object' && 'text' in v) v = v.text;
  if (v && typeof v === 'object' && 'richText' in v) v = v.richText.map(t => t.text).join('');
  return v;
}

// Uma aba por pagador (nome da aba = sigla ou nome do pagador). Coluna A =
// código, C..N = Jan..Dez (mesmo layout do modelo, exportarModeloOrcamento).
export async function lerPlanilhaOrcamento(file, cadastros, ano) {
  const ExcelJS = (await import('https://esm.sh/exceljs@4.4.0/dist/exceljs.min.js')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const norm = (t) => String(t || '').trim().toUpperCase();
  const pagadores = [];
  const abasIgnoradas = [];
  workbook.worksheets.forEach(sheet => {
    if (norm(sheet.name) === 'COMO PREENCHER') return;
    const pagador = (cadastros.pagadores || []).find(p => norm(p.sigla) === norm(sheet.name) || norm(p.nome) === norm(sheet.name));
    if (!pagador) { abasIgnoradas.push(sheet.name); return; }
    const linhas = [];
    sheet.eachRow((row, n) => {
      if (n === 1) return;
      linhas.push({ codigo: valorDaCelula(row.getCell(1)), meses: Array.from({ length: 12 }, (_, i) => valorDaCelula(row.getCell(3 + i))) });
    });
    pagadores.push({ id: pagador.id, nome: pagador.nome, resultado: interpretarOrcamento(linhas, cadastros, pagador) });
  });
  return { ano, pagadores, abasIgnoradas };
}

export function attachOrcamentoHandlers() {
  const selAno = document.getElementById('orc-ano');
  if (selAno) selAno.onchange = () => { app.state.orcamentoAno = Number(selAno.value); app.state.orcamentoPrevia = null; render(); };

  const btnModelo = document.getElementById('btn-modelo-orcamento');
  if (btnModelo) btnModelo.onclick = async () => {
    const original = btnModelo.textContent;
    btnModelo.disabled = true; btnModelo.textContent = 'Gerando...';
    try {
      const { exportarModeloOrcamento } = await import('./export_excel.js');
      await exportarModeloOrcamento(app.cadastros, app.orcamento, app.state.orcamentoAno || new Date().getFullYear());
    } catch (e) {
      showToast('Erro ao gerar o modelo: ' + e.message);
    } finally {
      btnModelo.disabled = false; btnModelo.textContent = original;
    }
  };

  const btnLer = document.getElementById('btn-ler-orcamento');
  if (btnLer) btnLer.onclick = async () => {
    const input = document.getElementById('orc-arquivo');
    const file = input && input.files && input.files[0];
    if (!file) { showToast('Escolha a planilha (.xlsx) primeiro.'); return; }
    btnLer.disabled = true; btnLer.textContent = 'Lendo...';
    try {
      const previa = await lerPlanilhaOrcamento(file, app.cadastros, app.state.orcamentoAno || new Date().getFullYear());
      if (!previa.pagadores.length) { showToast('Nenhuma aba com o nome de um pagador (COND, FPP, CONS...). Use o modelo baixado nesta tela.'); btnLer.disabled = false; btnLer.textContent = 'Ler planilha'; return; }
      app.state.orcamentoPrevia = previa;
      render();
    } catch (e) {
      showToast('Erro ao ler a planilha: ' + e.message);
      btnLer.disabled = false; btnLer.textContent = 'Ler planilha';
    }
  };

  const btnDesc = document.getElementById('btn-descartar-orcamento');
  if (btnDesc) btnDesc.onclick = () => { app.state.orcamentoPrevia = null; render(); };

  const btnGravar = document.getElementById('btn-gravar-orcamento');
  if (btnGravar) btnGravar.onclick = async () => {
    const previa = app.state.orcamentoPrevia;
    if (!previa) return;
    btnGravar.disabled = true; btnGravar.textContent = 'Gravando...';
    try {
      for (const p of previa.pagadores) {
        if (!p.resultado.registros.length) continue;
        await db.substituirOrcamento(p.id, previa.ano, p.resultado.registros, app.usuario);
      }
      app.orcamento = await db.carregarOrcamento();
      app.state.orcamentoPrevia = null;
      showToast('Orçamento gravado. O DRE da Visão geral já compara com ele.', 'success');
      render();
    } catch (e) {
      showToast('Erro ao gravar: ' + e.message);
      btnGravar.disabled = false; btnGravar.textContent = 'Gravar orçamento';
    }
  };

  /* ---- Despesas do Group ---- */
  const btnLerGroup = document.getElementById('btn-ler-group');
  if (btnLerGroup) btnLerGroup.onclick = async () => {
    const input = document.getElementById('group-arquivo');
    const file = input && input.files && input.files[0];
    if (!file) { showToast('Escolha o CSV exportado do Group primeiro.'); return; }
    btnLerGroup.disabled = true; btnLerGroup.textContent = 'Lendo...';
    try {
      // O Group exporta em latin1 (ISO-8859-1).
      const texto = new TextDecoder('iso-8859-1').decode(await file.arrayBuffer());
      const r = interpretarRelatorioGroup(texto, app.cadastros.pagadores);
      if (!r.lancamentos.length) throw new Error('Nenhum lançamento reconhecido no arquivo.');
      app.state.groupPrevia = { arquivo: file.name, ...r };
      render();
    } catch (e) {
      showToast('Erro ao ler o relatório: ' + e.message);
      btnLerGroup.disabled = false; btnLerGroup.textContent = 'Ler relatório';
    }
  };
  document.querySelectorAll('select.group-de-para').forEach(sel => {
    sel.onchange = async () => {
      if (!sel.value) return;
      const [tipo, id] = sel.value.split(':');
      sel.disabled = true;
      try {
        await db.salvarGroupMapeamento({
          pagador_id: sel.dataset.pagador, centro_nome: sel.dataset.centro, classe_base: sel.dataset.classe,
          codigo_classificacao_id: tipo === 'co' ? id : null, classe_conta_id: tipo === 'cl' ? id : null,
        });
        app.groupMapeamento = await db.carregarGroupMapeamento();
        render();
      } catch (e) {
        showToast('Erro ao salvar o de-para: ' + e.message);
        sel.disabled = false;
      }
    };
  });
  const btnDescGroup = document.getElementById('btn-descartar-group');
  if (btnDescGroup) btnDescGroup.onclick = () => { app.state.groupPrevia = null; render(); };
  const btnGravarGroup = document.getElementById('btn-gravar-group');
  if (btnGravarGroup) btnGravarGroup.onclick = async () => {
    const previa = app.state.groupPrevia;
    if (!previa) return;
    btnGravarGroup.disabled = true; btnGravarGroup.textContent = 'Gravando...';
    try {
      await db.substituirGroupLancamentos(previa.lancamentos.map(l => ({ ...l, importado_em: new Date().toISOString() })));
      app.groupLancamentos = await db.carregarGroupLancamentos();
      app.state.groupPrevia = null;
      showToast('Despesas do Group importadas. O DRE já usa o Group como realizado.', 'success');
      render();
    } catch (e) {
      showToast('Erro ao gravar: ' + e.message);
      btnGravarGroup.disabled = false; btnGravarGroup.textContent = 'Gravar lançamentos do Group';
    }
  };
}
