// Etapa 2 da melhoria do OCR: confiança por campo e preenchimento
// automático do MÁXIMO de campos do formulário.
//  - leitor_documentos.js: datas com rótulo (emissão / vencimento) e
//    confiancaDosCampos (menor confiança do Tesseract entre as palavras
//    de onde o valor saiu; abaixo do limiar = campo duvidoso).
//  - events_notas.js: "Preencher com estes dados" (mesma função do
//    preenchimento automático) também preenche emissão, competência e
//    forma de pagamento; marca cada campo como "Lido do documento" (e
//    "confira" quando duvidoso); avisa quando o boleto vence em data
//    diferente do vencimento do formulário (sem trocar -- é regra de
//    pagamento); a marca some quando a pessoa edita o campo.
// O disparo automático real (anexar e ler) depende de CDN -- aqui o estado
// "já lido" é simulado, como em leitor_documentos_auditoria_ui.mjs.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros } = await bootApp(PERFIS.departamento);
const { app } = await import('./app/src/js/state.js');
const { extrairCampos, confiancaDosCampos, reclassificarComHints, CONFIANCA_MINIMA_CAMPO } = await import('./app/src/js/leitor_documentos.js');

console.log('### datas com rótulo ###');
const textoNf = 'DANFE\nDATA DA EMISSÃO: 17/06/2026   DATA DA SAÍDA: 18/06/2026\nVALOR TOTAL DA NOTA R$ 1.234,56';
checarIgual(extrairCampos(textoNf).dataEmissao, '17/06/2026', 'acha a data de emissão pelo rótulo');
const textoBoleto = 'Data do documento\n14/02/2026\nLocal de pagamento Vencimento\nPagável em qualquer banco até o vencimento 06/03/2026\nApós o vencimento cobrar multa de 2% e juros de 1% ao mês.';
checarIgual(extrairCampos(textoBoleto).vencimento, '06/03/2026', 'acha o vencimento (rótulo e data podem estar em linhas diferentes)');
checarIgual(extrairCampos(textoBoleto).data, '14/02/2026', '`data` continua sendo a primeira data do texto (compatível)');
checarIgual(extrairCampos('Após o vencimento cobrar 2% de multa. Emitido 01/01/2026').vencimento, undefined, '"após o vencimento cobrar 2%" não puxa uma data qualquer');

console.log('\n### confiança por campo ###');
const palavras = { 1: [
  { texto: 'VALOR', conf: 96 }, { texto: 'R$', conf: 90 }, { texto: '1.234,56', conf: 62 },
  { texto: 'CNPJ:', conf: 95 }, { texto: '11.222.333/', conf: 93 }, { texto: '0001-81', conf: 91 },
] };
const campos = { valor: 1234.56, cnpj: '11.222.333/0001-81', numeroNota: '999' };
const { confiancaCampos, camposDuvidosos } = confiancaDosCampos(campos, palavras, 'ocr');
checarIgual(Math.round(confiancaCampos.valor), 62, 'confiança do valor = confiança da palavra de onde ele saiu');
checarIgual(Math.round(confiancaCampos.cnpj), 91, 'CNPJ partido em duas palavras: vale a menor confiança das duas');
checarIgual(confiancaCampos.numeroNota, null, 'valor que não aparece nas palavras fica sem confiança (null)');
checarIgual(camposDuvidosos.sort(), ['numeroNota', 'valor'], `duvidosos: abaixo de ${CONFIANCA_MINIMA_CAMPO} ou sem confiança`);
const digital = confiancaDosCampos(campos, undefined, 'pdf_texto');
checarIgual([digital.confiancaCampos.valor, digital.camposDuvidosos.length], [100, 0], 'PDF digital (texto embutido, não OCR): confiança 100, nada duvidoso');
const recl = reclassificarComHints('VALOR R$ 1.234,56', [], palavras, 'ocr');
checar(recl.camposDuvidosos.includes('valor'), 'reclassificarComHints também devolve os campos duvidosos');

console.log('\n### preencher o formulário com o documento ###');
document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));
const $ = (id) => document.getElementById(id);
$('nf-emissao').value = ''; $('nf-competencia').value = ''; $('nf-forma-pagamento').value = '';
app.anexosNovos.push(new dom.window.File(['x'], 'nf.png', { type: 'image/png' }));
app.anexosAnalises.push({
  status: 'pronto',
  resultado: {
    nomeArquivo: 'nf.png', fonte: 'ocr', tipoDetectado: 'nota_fiscal', texto: textoNf,
    campos: { numeroNota: '141025', valor: 1234.56, data: '17/06/2026', dataEmissao: '17/06/2026' },
    confiancaCampos: { numeroNota: 96, valor: 62, data: 95, dataEmissao: 95 }, camposDuvidosos: ['valor'],
  },
});
$('nf-tipo-contratacao').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 30));
document.querySelector('[data-preencher-com-documento="0"]').click();
await new Promise(r => setTimeout(r, 30));
checarIgual($('nf-numero').value, '141025', 'número da NF preenchido');
checarIgual($('nf-emissao').value, '2026-06-17', 'data de emissão preenchida (dd/mm/aaaa -> data do formulário)');
checarIgual($('nf-competencia').value, '2026-06', 'competência sugerida pelo mês da emissão');
checar($('nf-numero').classList.contains('campo-lido') && !$('nf-numero').classList.contains('campo-conferir'), 'número com boa confiança: marcado "lido do documento", sem "confira"');
checar($('nf-valor').classList.contains('campo-conferir'), 'valor com baixa confiança: marcado pra conferir');
checar($('nf-competencia').classList.contains('campo-conferir'), 'competência (derivada da emissão) sempre marcada pra conferir');
const dicaValor = $('nf-valor').closest('.field').querySelector('[data-campo-lido-dica]');
checar(!!dicaValor && dicaValor.textContent.includes('confira'), 'dica "Lido do documento — confira" aparece embaixo do valor');
$('nf-numero').value = '141026';
$('nf-numero').dispatchEvent(new dom.window.Event('input'));
checar(!$('nf-numero').classList.contains('campo-lido') && !$('nf-numero').closest('.field').querySelector('[data-campo-lido-dica]'), 'editar o campo tira a marca (o valor agora é da pessoa)');

console.log('\n### boleto: forma de pagamento e aviso de vencimento ###');
$('nf-vencimento').value = '2026-03-11';
app.anexosNovos.push(new dom.window.File(['x'], 'boleto.png', { type: 'image/png' }));
app.anexosAnalises.push({
  status: 'pronto',
  resultado: {
    nomeArquivo: 'boleto.png', fonte: 'ocr', tipoDetectado: 'boleto', texto: textoBoleto,
    campos: { valor: 1234.56, data: '14/02/2026', vencimento: '06/03/2026' },
    confiancaCampos: { valor: 95, data: 95, vencimento: 95 }, camposDuvidosos: [],
  },
});
$('nf-tipo-contratacao').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 30));
document.querySelector('[data-preencher-com-documento="1"]').click();
await new Promise(r => setTimeout(r, 30));
checarIgual($('nf-forma-pagamento').value, 'Boleto bancário', 'boleto anexado preenche a forma de pagamento');
$('nf-valor').value = '';
app.anexosAnalises[1].resultado.camposValidados = ['valor', 'vencimento', 'linhaDigitavel'];
document.querySelector('[data-preencher-com-documento="1"]').click();
await new Promise(r => setTimeout(r, 30));
const dicaValidado = $('nf-valor').closest('.field').querySelector('[data-campo-lido-dica]');
checar(!!dicaValidado && dicaValidado.textContent.includes('dígito verificador') && !$('nf-valor').classList.contains('campo-conferir'), 'valor confirmado pela linha digitável: marca diz "confirmado pelo dígito verificador", sem "confira"');
checarIgual($('nf-vencimento').value, '2026-03-11', 'vencimento do formulário (regra de pagamento) NÃO é trocado pelo do boleto');
const aviso = $('nf-vencimento').closest('.field').querySelector('[data-aviso-vencimento-boleto]');
checar(!!aviso && aviso.textContent.includes('06/03/2026') && aviso.textContent.includes('antes'), 'avisa que o boleto vence em 06/03/2026, antes da data do formulário');
checarIgual($('nf-emissao').value, '2026-06-17', 'a primeira data do boleto (data do documento) não vira emissão');

checarSemErrosNaoTratados(erros);
relatorioFinal('leitor_documentos_confianca_e_preenchimento');
