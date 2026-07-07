// Botão "Baixar anexos (.zip)" no modal de "Abrir chamado": existe,
// dispara a chamada certa, e trata erro sem travar o botão. A geração
// real do .zip (JSZip) usa feature-detection de Blob de navegador real,
// que o jsdom não simula -- funciona nativamente num navegador de
// verdade (ver tests/e2e). Aqui só confirmamos a wiring.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros, supabaseClientMod } = await bootApp(PERFIS.contasAPagar);

// "Abrir chamado" só lista notas com status 'lancado_no_group' -- nenhuma
// do fixture base está exatamente nesse ponto do ciclo, então cria uma só
// pra este teste (não interfere com nenhum outro driver, cada um roda no
// seu próprio processo).
supabaseClientMod.__fixtures().notas.push({
  id: 'nota-teste-lancado-group', numero_nota: 'NF-LG-1', valor_bruto: '300.00', descricao: 'pronta pra abrir chamado',
  pagador_id: 'pag-1', fornecedor_id: 'forn-8', forma_pagamento: 'Boleto bancário',
  classificacao: 'Compras', tem_rateio: false, centro_custo_id: 'cc-1', classe_conta_id: 'cl-1',
  codigo_classificacao_id: null, status: 'lancado_no_group', pendente: false, motivo_pendencia: null,
  setor: 'Marketing', criado_por: 'u-dept-1', criado_em: new Date().toISOString(), data_emissao: '2026-06-01', vencimento: '2026-07-10', competencia: '2026-06-01',
  aprovado_por: 'u-gerente-1', data_aprovacao: new Date().toISOString(), numero_chamado: null, data_pagamento: null,
  numero_lancamento_group: 'GR-100', data_lancamento_group: new Date().toISOString(), data_validacao_csc: null, validado_por: null,
  anexo_arquivado_em: null, anexos: [], nota_rateios: [], nota_historico: [],
});
// app.notas já foi carregado no boot, antes da nota de teste ser
// empurrada pro fixture -- "Atualizar dados" recarrega tudo de novo.
// #btn-refresh só existe dentro de Configurações agora (não
// depende de estar naquela tela pra recarregar os dados no teste --
// chama a mesma função que o botão chamaria).
const { carregarTudo } = await import('./app/src/js/app.js');
await carregarTudo();
window.__render();
await new Promise(r => setTimeout(r, 150));

document.querySelector('[data-view="abrir_chamado"]').click();
await new Promise(r => setTimeout(r, 100));
const grupo = document.querySelector('.grupo-card');
checar(!!grupo, 'existe pelo menos 1 grupo na fila "Abrir chamado"');

grupo.querySelector('[data-lote-action]').click();
await new Promise(r => setTimeout(r, 100));
const btnZip = document.getElementById('btn-baixar-zip-chamado');
checar(!!btnZip, 'botão "Baixar anexos (.zip)" existe no modal de abrir chamado');

const textoOriginal = btnZip.textContent;
btnZip.click();
await new Promise(r => setTimeout(r, 400));
checar(!btnZip.disabled, 'botão volta a ficar habilitado depois da tentativa (não trava a UI mesmo com erro)');
checar(btnZip.textContent === textoOriginal, 'texto do botão volta ao normal depois da tentativa');

checarSemErrosNaoTratados(erros, 'zip_abrir_chamado_wiring');
relatorioFinal('zip_abrir_chamado_wiring');
