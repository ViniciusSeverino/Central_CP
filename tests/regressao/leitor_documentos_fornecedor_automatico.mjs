// Fornecedor primeiro: pedido do dono do produto foi (1) o campo
// Fornecedor virar o primeiro campo depois dos anexos, (2) a leitura do
// documento detectar o fornecedor sozinha pelo CNPJ (correspondência
// exata, não achismo -- funciona já no primeiro documento de um
// fornecedor novo, diferente das dicas de âncora/posição que dependem de
// já ter aprendido algo antes) e (3) corrigir um campo que a IA preencheu
// errado também vira aprendizado, igual responder uma pergunta do painel
// "ensinar o leitor".
//
// O disparo automático de verdade (anexar um PDF/imagem real e a leitura
// rodar sozinha) depende de CDN (pdf-lib/tesseract.js), que este ambiente
// de teste bloqueia -- mesma limitação já documentada em
// anexos_upload_wiring_no_formulario.mjs e leitor_documentos_auditoria_ui.mjs.
// Por isso: a função pura de casamento por CNPJ é testada direto (sem
// precisar de arquivo nenhum); o reposicionamento do campo é uma checagem
// de DOM; e o aprendizado por correção é testado simulando o estado como
// se a leitura já tivesse preenchido os campos sozinha (exatamente como
// leitor_documentos_auditoria_ui.mjs já faz pro botão manual "Preencher
// com documento") -- o gatilho em si (blur do campo) é síncrono e não
// depende de CDN nenhum, então é testável ponta a ponta de verdade aqui.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros } = await bootApp(PERFIS.departamento);
const { app } = await import('./app/src/js/state.js');
const { encontrarFornecedorPorCnpj } = await import('./app/src/js/aprendizado_extracao.js');
const { renderFornecedorAutoHint } = await import('./app/src/js/ui_nota.js');

// 1) Função pura de casamento por CNPJ.
const fornecedoresTeste = [
  { id: 'f1', nome: 'Fornecedor A', cnpj: '12.345.678/0001-99' },
  { id: 'f2', nome: 'Fornecedor B', cnpj: null },
];
checarIgual(encontrarFornecedorPorCnpj('12.345.678/0001-99', fornecedoresTeste).id, 'f1', 'acha o fornecedor pelo CNPJ formatado igual ao cadastro');
checarIgual(encontrarFornecedorPorCnpj('12345678000199', fornecedoresTeste).id, 'f1', 'acha mesmo se o CNPJ lido veio sem pontuação (compara só os dígitos)');
checarIgual(encontrarFornecedorPorCnpj('99.999.999/9999-99', fornecedoresTeste), null, 'CNPJ que não bate com nenhum cadastro devolve null');
checarIgual(encontrarFornecedorPorCnpj('123', fornecedoresTeste), null, 'CNPJ com menos de 14 dígitos (extração ruim) devolve null, não tenta casar');
checarIgual(encontrarFornecedorPorCnpj(null, fornecedoresTeste), null, 'sem CNPJ lido devolve null, sem quebrar');
checarIgual(encontrarFornecedorPorCnpj('12.345.678/0001-99', []), null, 'lista de fornecedores vazia devolve null, sem quebrar');

// 2) Aviso "detectado automaticamente" -- só aparece com o flag ligado.
app.fornecedorAutoDetectado = false;
checarIgual(renderFornecedorAutoHint(), '', 'sem detecção automática marcada, o aviso não renderiza nada');
app.fornecedorAutoDetectado = true;
checar(renderFornecedorAutoHint().includes('Detectado automaticamente'), 'com a detecção automática marcada, o aviso aparece');
app.fornecedorAutoDetectado = false; // não vaza pro resto do teste

// 3) Campo Fornecedor agora mora na seção "Documento", logo depois dos
// anexos (antes ficava lá embaixo, na seção "Pagamento").
document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));
const secaoDocumento = document.getElementById('anexos-area').closest('.form-section');
checar(!!secaoDocumento && !!secaoDocumento.querySelector('#nf-fornecedor-busca'), 'campo Fornecedor está na mesma seção "Documento" dos anexos (não mais em "Pagamento")');
const camposDaSecao = Array.from(secaoDocumento.querySelectorAll(':scope > .field'));
const idxAnexos = camposDaSecao.findIndex(f => f.querySelector('#anexos-area'));
const idxFornecedor = camposDaSecao.findIndex(f => f.querySelector('#nf-fornecedor-busca'));
checarIgual(idxFornecedor, idxAnexos + 1, 'Fornecedor é o campo logo depois de "Arquivos anexos"');

// 4) Corrigir um campo que a IA preencheu (auto ou via "Preencher com
// documento") depois de escolhido o fornecedor vira uma dica aprendida --
// mesma lógica de responder uma pergunta do painel "ensinar o leitor",
// só que disparada ao tirar o foco do campo em vez de clicar num chip.
const fornecedorId = 'forn-3';
document.getElementById('nf-fornecedor').value = fornecedorId;
app.anexosAnalises[0] = {
  status: 'pronto',
  resultado: { texto: 'NOTA FISCAL\nDesconto: R$ 850,50\nValor Total: R$ 900,00', campos: {} },
};
document.getElementById('nf-valor').value = '850.5';
app.iaValoresPreenchidos.valor = { valor: 850.5, origemIndice: 0 };

checarIgual(app.extracaoHints.filter(h => h.fornecedor_id === fornecedorId).length, 0, 'antes de corrigir, ainda não existe nenhuma dica aprendida pra esse fornecedor');

// 4a) Perder o foco SEM mudar o valor não aprende nada (evita salvar uma
// "dica" toda vez que a pessoa só clica no campo e sai, sem corrigir).
document.getElementById('nf-valor').dispatchEvent(new dom.window.Event('blur'));
await new Promise(r => setTimeout(r, 50));
checarIgual(app.extracaoHints.filter(h => h.fornecedor_id === fornecedorId).length, 0, 'perder o foco sem alterar o valor não aprende nada');

// 4b) Corrigir de fato (850,50 -> 900) e perder o foco aprende a dica.
document.getElementById('nf-valor').value = '900';
document.getElementById('nf-valor').dispatchEvent(new dom.window.Event('blur'));
await new Promise(r => setTimeout(r, 50));
const hintValor = app.extracaoHints.find(h => h.fornecedor_id === fornecedorId && h.campo === 'valor');
checar(!!hintValor, 'corrigir o valor bruto depois do preenchimento automático aprende uma dica pro fornecedor');
if (hintValor) checar(hintValor.ancora.includes('valor total'), 'a âncora aprendida é o texto do documento logo antes do valor corrigido');

// 4c) Mesma coisa pro Número da NF (campo de texto simples, sem a
// conversão de formato do valor monetário).
app.anexosAnalises[1] = {
  status: 'pronto',
  resultado: { texto: 'NOTA FISCAL\nNumero: 111\nNF: 555-A', campos: {} },
};
document.getElementById('nf-numero').value = '111';
app.iaValoresPreenchidos.numeroNota = { valor: '111', origemIndice: 1 };
document.getElementById('nf-numero').value = '555-A';
document.getElementById('nf-numero').dispatchEvent(new dom.window.Event('blur'));
await new Promise(r => setTimeout(r, 50));
const hintNumero = app.extracaoHints.find(h => h.fornecedor_id === fornecedorId && h.campo === 'numeroNota');
checar(!!hintNumero, 'corrigir o número da NF depois do preenchimento automático também aprende uma dica');

// 4d) Sem fornecedor selecionado, a correção não aprende nada (não dá pra
// saber de qual fornecedor é a dica) -- mesma regra do painel de perguntas.
document.getElementById('nf-fornecedor').value = '';
app.anexosAnalises[2] = { status: 'pronto', resultado: { texto: 'Total: R$ 700,00', campos: {} } };
document.getElementById('nf-valor').value = '650';
app.iaValoresPreenchidos.valor = { valor: 650, origemIndice: 2 };
document.getElementById('nf-valor').value = '700';
document.getElementById('nf-valor').dispatchEvent(new dom.window.Event('blur'));
await new Promise(r => setTimeout(r, 50));
checarIgual(app.extracaoHints.filter(h => h.fornecedor_id === 'forn-3' && h.valor_exemplo === '700').length, 0, 'sem fornecedor selecionado, corrigir o campo não aprende dica nenhuma');

checarSemErrosNaoTratados(erros, 'leitor_documentos_fornecedor_automatico');
relatorioFinal('leitor_documentos_fornecedor_automatico');
