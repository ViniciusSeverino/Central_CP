// src/js/events_orcamento.js -- Configurações › Orçamento (ver ui_orcamento.js).
import { app } from './state.js';
import { render } from './app.js';
import { showToast } from './toast.js';
import * as db from './db.js';
import { interpretarOrcamento } from './orcamento.js';

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
      showToast('Orçamento gravado. O DRE da Visão geral já compara com ele.');
      render();
    } catch (e) {
      showToast('Erro ao gravar: ' + e.message);
      btnGravar.disabled = false; btnGravar.textContent = 'Gravar orçamento';
    }
  };
}
