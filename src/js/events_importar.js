// src/js/events_importar.js — aba Cadastros → Importar histórico (só administrador)
//
// A leitura do .xlsx (exceljs) e o mapeamento cabeçalho -> chave ficam aqui;
// a lógica pura de agrupar/resolver/validar linhas fica em import_historico.js
// (sem DOM/rede, pra dar pra testar sozinha — ver COLUNAS_IMPORTACAO lá, que
// esse mapeamento espelha).
import { app } from './state.js';
import * as db from './db.js';
import { processarLinhasImportacao } from './import_historico.js';
import { render } from './app.js';
import { showToast } from './toast.js';

const CABECALHO_PARA_CHAVE = {
  'Nº NF': 'numero_nota',
  'Fornecedor': 'fornecedor',
  'CNPJ': 'cnpj',
  'Pagador': 'pagador',
  'Setor solicitante': 'setor',
  'Data emissão': 'data_emissao',
  'Vencimento': 'vencimento',
  'Competência': 'competencia',
  'Valor da linha': 'valor_bruto',
  'Forma de pagamento': 'forma_pagamento',
  'Classificação': 'classificacao',
  'Centro de custo': 'centro_custo',
  'Classe da conta': 'classe_conta',
  'Código classificação': 'codigo_classificacao',
  'Status': 'status',
  'Pendente': 'pendente',
  'Motivo da pendência': 'motivo_pendencia',
  'Solicitado por': 'solicitado_por',
  'Aprovado por': 'aprovado_por',
  'Data aprovação': 'data_aprovacao',
  'Nº lançamento Group': 'numero_lancamento_group',
  'Data lançamento Group': 'data_lancamento_group',
  'Nº chamado Acelerato': 'numero_chamado',
  'Data chamado': 'data_chamado',
  'Data validação CSC': 'data_validacao_csc',
  'Validado por': 'validado_por',
  'Data pagamento': 'data_pagamento',
  // "Conta bancária" fica de fora de propósito: é texto livre já formatado
  // na exportação ("Banco X · Ag Y · CC Z"), sem id confiável pra resolver
  // de volta pra uma conta cadastrada — ver comentário em import_historico.js.
};

function valorDaCelula(cell) {
  let v = cell.value;
  if (v && typeof v === 'object' && 'result' in v) v = v.result; // fórmula
  if (v && typeof v === 'object' && 'text' in v) v = v.text; // rich text
  if (v && typeof v === 'object' && 'richText' in v) v = v.richText.map(t => t.text).join('');
  return v;
}

async function lerPlanilha(file) {
  const ExcelJS = (await import('https://esm.sh/exceljs@4.4.0/dist/exceljs.min.js')).default;
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('Notas') || workbook.worksheets[0];
  if (!sheet) throw new Error('A planilha não tem nenhuma aba.');

  const colunas = {}; // número da coluna -> chave snake_case
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const texto = (cell.value == null ? '' : String(cell.value)).trim();
    const chave = CABECALHO_PARA_CHAVE[texto];
    if (chave) colunas[colNumber] = chave;
  });
  if (Object.keys(colunas).length === 0) {
    throw new Error('Não reconheci as colunas dessa planilha — use o modelo baixado nesta tela.');
  }

  const linhas = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const linha = {};
    let vazia = true;
    Object.entries(colunas).forEach(([colNumber, chave]) => {
      const valor = valorDaCelula(row.getCell(Number(colNumber)));
      if (valor !== null && valor !== undefined && valor !== '') vazia = false;
      linha[chave] = valor;
    });
    if (!vazia) linhas.push(linha);
  });
  return linhas;
}

export function attachImportarHandlers() {
  const btnModelo = document.getElementById('btn-baixar-modelo-importacao');
  if (btnModelo) btnModelo.onclick = async () => {
    const original = btnModelo.textContent;
    btnModelo.disabled = true; btnModelo.textContent = 'Gerando...';
    try {
      const { exportarModeloImportacao } = await import('./export_excel.js');
      await exportarModeloImportacao();
    } catch (e) {
      showToast('Erro ao gerar modelo: ' + e.message);
    } finally {
      btnModelo.disabled = false; btnModelo.textContent = original;
    }
  };

  const btnProcessar = document.getElementById('btn-processar-importacao');
  if (btnProcessar) btnProcessar.onclick = async () => {
    const input = document.getElementById('importar-arquivo');
    const file = input && input.files && input.files[0];
    if (!file) { showToast('Escolha um arquivo .xlsx primeiro.'); return; }
    const original = btnProcessar.textContent;
    btnProcessar.disabled = true; btnProcessar.textContent = 'Lendo...';
    try {
      const linhasCruas = await lerPlanilha(file);
      if (linhasCruas.length === 0) { showToast('Não encontrei nenhuma linha preenchida nessa planilha.'); return; }
      app.importar.resultado = processarLinhasImportacao(linhasCruas, {
        cadastros: app.cadastros,
        usuarios: app.usuarios,
        notasExistentes: app.notas,
        usuarioImportador: app.usuario,
      });
      app.importar.resumoFinal = null;
      render();
    } catch (e) {
      showToast('Erro ao ler a planilha: ' + e.message);
    } finally {
      btnProcessar.disabled = false; btnProcessar.textContent = original;
    }
  };

  const btnConfirmar = document.getElementById('btn-confirmar-importacao');
  if (btnConfirmar) btnConfirmar.onclick = async () => {
    const prontas = app.importar.resultado.prontas;
    if (!confirm(`Confirma a importação de ${prontas.length} lançamento(s)? Cada um vira uma nota normal (dá pra excluir/cancelar individualmente depois, mas não tem um "desfazer" em lote).`)) return;
    btnConfirmar.disabled = true;
    const falhas = [];
    let importadas = 0;
    for (const nota of prontas) {
      btnConfirmar.textContent = `Importando... (${importadas + falhas.length + 1}/${prontas.length})`;
      try {
        await db.importarNotaHistorica(nota);
        importadas++;
      } catch (e) {
        falhas.push({ linhas: nota._linhasPlanilha, motivo: e.message });
      }
    }
    app.notas = await db.carregarNotas();
    app.cadastros = await db.carregarCadastros();
    app.importar.resultado = null;
    app.importar.resumoFinal = { importadas, falhas };
    render();
  };
}
