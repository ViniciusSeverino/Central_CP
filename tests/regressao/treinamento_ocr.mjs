// Aba Treinamento do leitor de documentos (OCR): só o administrador vê;
// lista as notas pagas com anexo (agrupadas por fornecedor); os cartões de
// cada campo comparam o lançado com o que o leitor acha; a indicação
// desenhada vira uma dica do fornecedor com posição, página e tipo da
// página. A parte do documento (pdf.js, canvas, retângulo) roda num
// navegador de verdade em tests/e2e/treinamento_ocr_pdf_digital.mjs --
// aqui fica o que dá pra provar sem CDN.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

console.log('### quem vê a aba ###');
const { document, erros } = await bootApp(PERFIS.administrador);
checar(!!document.querySelector('[data-view="treinamento"]'), 'administrador vê "Treinamento do leitor" no menu');
const T = await import('./app/src/js/treinamento_ocr.js');
const { app } = await import('./app/src/js/state.js');
const { navItemsFor } = await import('./app/src/js/ui.js');
const papeisAdmin = app.papeisEfetivos;
for (const papel of ['gerente_financeiro', 'contas_a_pagar', 'departamento']) {
  app.papeisEfetivos = [papel];
  checar(!navItemsFor({ ...app.usuario, role: papel }).some(i => i.key === 'treinamento'), `${papel} NÃO vê "Treinamento do leitor"`);
}
app.papeisEfetivos = papeisAdmin;

console.log('\n### notas para treinar ###');
const base = { status: 'pago', anexos: ['x/final.pdf'], anexo_arquivado_em: null, fornecedor_id: 'fa', valor_bruto: '100.00' };
const notas = [
  { ...base, id: 'a1', numero_nota: '1', data_emissao: '2026-03-01' },
  { ...base, id: 'a2', numero_nota: '2', data_emissao: '2026-04-01' },
  { ...base, id: 'b1', numero_nota: '3', fornecedor_id: 'fb' },
  { ...base, id: 'arq', anexos: [], anexo_arquivado_em: '2026-05-01' },
  { ...base, id: 'lan', status: 'lancado' },
];
checarIgual(T.notasParaTreino(notas).map(n => n.id), ['a1', 'a2', 'b1'], 'só notas pagas que ainda têm o anexo (arquivada e em andamento ficam de fora)');
const fornecedores = [{ id: 'fa', nome: 'Alfa' }, { id: 'fb', nome: 'Beta' }];
const grupos = T.gruposParaTreino(notas, { fornecedores, treinadas: new Set(['a1']) });
checarIgual(grupos.map(g => [g.nome, g.total, g.treinadas]), [['Alfa', 2, 1], ['Beta', 1, 0]], 'agrupa por fornecedor, quem tem mais notas primeiro, com quantas já foram treinadas');
checarIgual(grupos[0].notas.map(n => n.id), ['a2', 'a1'], 'dentro do fornecedor, a nota mais recente primeiro');
checarIgual(T.gruposParaTreino(notas, { fornecedores, treinadas: new Set(['a1']), soPendentes: true })[0].notas.map(n => n.id), ['a2'], '"só as ainda não treinadas" esconde a treinada');
checarIgual(T.gruposParaTreino(notas, { fornecedores, busca: 'bet' }).map(g => g.nome), ['Beta'], 'busca pelo nome do fornecedor');

console.log('\n### campos de uma nota ###');
const nota = { numero_nota: '000123', valor_bruto: '1234.56', valor_liquido: '1100.00', data_emissao: '2026-03-05', fornecedor_id: 'fa' };
const campos = T.camposDoTreino(nota, { cnpj: '11.222.333/0001-81' });
checarIgual(campos.map(c => c.campo), ['numeroNota', 'valor', 'cnpj', 'dataEmissao', 'vencimento'], 'número, valor, CNPJ, emissão e vencimento do boleto');
checarIgual(campos.find(c => c.campo === 'valor').lancado, [1234.56, 1100], 'valor aceita o bruto ou o líquido (o anexo pode ser o boleto do líquido)');
checarIgual(campos.find(c => c.campo === 'vencimento').lancado, null, 'vencimento do boleto não tem gabarito (o lançado é a data de pagamento)');
checarIgual(T.camposDoTreino(nota, { cnpj: '529.982.247-25' })[2].campo, 'cpf', 'fornecedor pessoa física: o campo é CPF');
checarIgual(T.situacaoDoCampo('numeroNota', '000123', '123'), true, 'leitor acerta (zeros à esquerda não contam)');
checarIgual(T.situacaoDoCampo('numeroNota', '000123', '998877'), false, 'leitor erra');
checarIgual(T.situacaoDoCampo('numeroNota', '000123', undefined), false, 'leitor não achou = erra');
checarIgual(T.situacaoDoCampo('vencimento', null, '15/03/2026'), null, 'sem gabarito: sem situação');
checarIgual(T.situacaoDoCampo('cnpj', '11.222.333/0001-81', '11222333000181'), true, 'CNPJ compara só os dígitos');

console.log('\n### dica montada a partir da indicação ###');
const dica = T.montarDica({
  fornecedorId: 'fa', campo: 'numeroNota', valor: '123456', textoRegiao: 'Documento 123456',
  textoDocumento: 'DANFE NOTA FISCAL\nPedido 998877\nDocumento 123456\nCNPJ ...', pagina: 2,
  regiao: { x: 0.6, y: 0.1, largura: 0.2, altura: 0.04 }, tipoPagina: 'nota_fiscal',
});
checarIgual([dica.fornecedor_id, dica.campo, dica.valor_exemplo, dica.pagina, dica.tipo_pagina, dica.pos_x, dica.pos_largura], ['fa', 'numeroNota', '123456', 2, 'nota_fiscal', 0.6, 0.2], 'fornecedor, campo, valor, página, tipo da página e retângulo');
checar(dica.ancora.endsWith('documento'), `âncora de texto (o trecho logo antes do valor) vai junto -- veio "${dica.ancora}"`);
checarIgual(Object.keys(T.dicasPorCampo([{ fornecedor_id: 'fa', campo: 'valor' }, { fornecedor_id: 'fa', campo: 'tipo' }, { fornecedor_id: 'fb', campo: 'valor' }], 'fa')), ['valor'], 'dicas por campo do fornecedor (sem a de tipo de documento)');

console.log('\n### tela: lista ###');
app.notas.push({ ...base, id: 'nota-treino', numero_nota: '555', fornecedor_id: app.cadastros.fornecedores[0].id, data_emissao: '2026-03-05', valor_liquido: null });
app.treinamentoNotas = [];
document.querySelector('[data-view="treinamento"]').click();
await new Promise(r => setTimeout(r, 50));
checar(!!document.querySelector('[data-treino-abrir="nota-treino"]'), 'a nota paga com anexo aparece na lista com o botão "Treinar"');
checar(!!document.getElementById('btn-treino-medir-geral'), 'painel "Acerto do leitor" com o botão "Medir acerto"');
const { renderCartoesCampos, renderPainelAcerto } = await import('./app/src/js/ui_treinamento.js');
const html = renderCartoesCampos(app.notas.find(n => n.id === 'nota-treino'), { leitura: { campos: { numeroNota: '999' } }, captura: null, ativo: null });
checar(html.includes('data-treino-campo="numeroNota"') && html.includes('Leitor erra'), 'cartão do nº mostra "Leitor erra" quando o lido difere do lançado');
checar(html.includes('data-treino-indicar="vencimento"'), 'cartão do vencimento do boleto com "Indicar no documento"');
const htmlCap = renderCartoesCampos(app.notas.find(n => n.id === 'nota-treino'), { leitura: { campos: {} }, captura: { campo: 'numeroNota', valor: '777', pagina: 1 }, ativo: 'numeroNota' });
checar(htmlCap.includes('data-treino-salvar="numeroNota"') && htmlCap.includes('Salvar mesmo assim'), 'valor desenhado diferente do lançado: pede "Salvar mesmo assim"');
const painel = renderPainelAcerto({ feitas: 2, total: 2, agregado: { casos: 2, total: { numeroNota: { casos: 2, acerto: 1, erro: 1, ausente: 0, noTexto: 0, acertoSinalizado: 0, erroSinalizado: 1 } } } });
checar(painel.includes('1 de 2') && painel.includes('Lidas 2 de 2'), 'painel de acerto mostra "acertos X de Y" por campo');

checarSemErrosNaoTratados(erros, 'treinamento_ocr');
relatorioFinal('treinamento_ocr');
