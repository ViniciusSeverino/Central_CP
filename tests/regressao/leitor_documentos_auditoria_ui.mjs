// Painel de auditoria de anexos (leitor de documentos, documento WE9) no
// formulário de nota: mostra o estado de cada arquivo anexado
// (analisando/lido/não lido), o checklist de documentos esperados pra
// essa nota, avisos de documento faltando e de divergência entre o que
// foi digitado e o que o leitor encontrou, e o botão "Preencher com
// estes dados".
//
// A extração de verdade (PDF/OCR) depende de CDN (pdf-lib/tesseract.js),
// que o Node bloqueia fora de um navegador -- ver
// anexos_upload_wiring_no_formulario.mjs pro mesmo caso já documentado.
// Por isso: um arquivo de tipo não suportado (text/plain) prova o
// caminho "não foi possível ler" ponta a ponta de verdade (passa pelo
// analisarAnexo() real); o caminho "documento lido com sucesso" é
// simulado escrevendo direto em app.anexosAnalises (mesmo formato que
// analisarAnexo() produziria) -- é o que tests/e2e faz de verdade com
// Chromium real pro PDF/OCR em si.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.departamento);
global.File = dom.window.File;
const { app } = await import('./app/src/js/state.js');
const { auditarAnexos } = await import('./app/src/js/documentos_obrigatorios.js');

document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));

// 1) Arquivo de tipo não suportado -- passa pelo leitor de verdade
// (analisarAnexo real) e acaba marcado como "não foi possível ler".
const input = document.getElementById('nf-anexos-input');
const arquivoTexto = new dom.window.File(['conteudo qualquer'], 'anotacao.txt', { type: 'text/plain' });
Object.defineProperty(input, 'files', { value: [arquivoTexto], configurable: true });
input.dispatchEvent(new dom.window.Event('change'));
checar(document.body.textContent.includes('analisando'), 'logo depois de anexar (antes da análise assíncrona terminar), a linha mostra "analisando..."');
await new Promise(r => setTimeout(r, 200));
checar(document.body.textContent.includes('não foi possível ler automaticamente'), 'tipo de arquivo não suportado (texto puro) acaba marcado como "não foi possível ler"');
checarIgual(app.anexosAnalises[0].status, 'pronto', 'analisarAnexo real completa sem lançar erro pra tipo não suportado (só não identifica nada)');
checarIgual(app.anexosAnalises[0].resultado.fonte, 'nao_lido', 'fonte fica "nao_lido" pra tipo de arquivo sem suporte (nem PDF nem imagem)');

// 2) Escolhe forma de pagamento TED -- checklist de documentos esperados
// passa a incluir "Comprovante de pagamento".
document.getElementById('nf-forma-pagamento').value = 'TED';
document.getElementById('nf-forma-pagamento').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 30));
checar(document.body.textContent.includes('Comprovante de pagamento'), 'escolher TED faz a auditoria listar "Comprovante de pagamento" como documento esperado');

// 3) Simula um segundo anexo já "lido com sucesso" como nota fiscal, com
// NF e valor DIFERENTES do que está no formulário -- espera aparecer a
// divergência e o botão de preencher.
document.getElementById('nf-numero').value = 'NF-999';
document.getElementById('nf-numero').dispatchEvent(new dom.window.Event('input'));
document.getElementById('nf-valor').value = '1000';
document.getElementById('nf-valor').dispatchEvent(new dom.window.Event('input'));
app.anexosNovos.push(new dom.window.File(['conteudo'], 'nf-fornecedor.pdf', { type: 'application/pdf' }));
app.anexosAnalises.push({
  status: 'pronto',
  resultado: { nomeArquivo: 'nf-fornecedor.pdf', fonte: 'pdf_texto', tipoDetectado: 'nota_fiscal', texto: 'NOTA FISCAL...', campos: { numeroNota: '12345', valor: 850.5 } },
});
// dispara um refresh da área de anexos através de outro campo (mesmo
// mecanismo que o app usa de verdade -- nenhuma função interna exportada
// só pra isso, o refresh é sempre efeito colateral de um campo mudando).
document.getElementById('nf-tipo-contratacao').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 30));

checar(document.body.textContent.includes('Nota fiscal'), 'segundo anexo aparece classificado como "Nota fiscal" na lista');
checar(document.body.textContent.includes('texto do PDF'), 'mostra que essa análise veio do texto do PDF (não OCR)');
checar(!!document.querySelector('[data-preencher-com-documento]'), 'botão "Preencher com estes dados" aparece pro anexo com campos extraídos');
// A mensagem de divergência interpola texto digitado pelo usuário (Nº NF,
// nome do arquivo) e por isso passa por escapeHtml() -- no jsdom isso
// sempre renderiza vazio (limitação conhecida, documentada em vários
// outros testes desta suíte), então a verificação certa é direto na
// função pura que gera a divergência, não lendo o texto renderizado.
const auditoriaAntes = auditarAnexos(
  { numero_nota: document.getElementById('nf-numero').value, valor_bruto: parseFloat(document.getElementById('nf-valor').value) },
  [app.anexosAnalises[1].resultado],
);
checarIgual(auditoriaAntes.divergencias.length, 2, 'NF (NF-999 vs 12345) e valor (1000 vs 850.5) digitados geram 2 divergências antes de preencher');

// 4) Clicar em "Preencher com estes dados" substitui os campos do
// formulário pelos valores extraídos, e a divergência some depois.
document.querySelector('[data-preencher-com-documento]').click();
await new Promise(r => setTimeout(r, 30));
checarIgual(document.getElementById('nf-numero').value, '12345', 'Nº NF do formulário foi substituído pelo valor extraído do documento');
checarIgual(document.getElementById('nf-valor').value, '850.5', 'valor bruto do formulário foi substituído pelo valor extraído do documento');
const auditoriaDepois = auditarAnexos(
  { numero_nota: document.getElementById('nf-numero').value, valor_bruto: parseFloat(document.getElementById('nf-valor').value) },
  [app.anexosAnalises[1].resultado],
);
checarIgual(auditoriaDepois.divergencias.length, 0, 'depois de preencher com os dados do documento, nenhuma divergência resta (os campos agora batem)');

// 5) Salvar a nota registra um resumo da auditoria no histórico dela --
// é o que deixa essa análise "servir como auditoria" depois, não só na
// hora do preenchimento (documento WE9).
document.getElementById('nf-emissao').value = '2026-07-01';
document.getElementById('nf-vencimento').value = '2026-07-08';
document.getElementById('nf-competencia').value = '2026-07';
document.getElementById('nf-pagador').value = 'pag-1';
document.getElementById('nf-pagador').dispatchEvent(new dom.window.Event('change'));
document.getElementById('nf-fornecedor').value = 'forn-1';
document.getElementById('nf-classificacao').value = 'Compras';
document.getElementById('nf-centro-custo').value = 'cc-1';
document.getElementById('nf-centro-custo').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 30));
document.getElementById('nf-classe-conta').value = 'cl-1';
document.getElementById('btn-salvar-nota').click();
await new Promise(r => setTimeout(r, 200));

const notaSalva = supabaseClientMod.__fixtures().notas.find(n => n.numero_nota === '12345');
checar(!!notaSalva, 'a nota foi salva com sucesso');
const historicoAuditoria = supabaseClientMod.__fixtures().nota_historico.find(h => h.nota_id === notaSalva.id && h.acao === 'Auditoria de anexos (leitor de documentos)');
checar(!!historicoAuditoria, 'o histórico da nota ganha uma entrada de auditoria de anexos ao salvar');
checar(historicoAuditoria.detalhe.includes('Nota fiscal'), 'o detalhe da entrada de histórico menciona o tipo de documento identificado');
checar(historicoAuditoria.detalhe.includes('Comprovante de pagamento'), 'o detalhe menciona o documento que ainda não foi identificado (comprovante de pagamento, nota é TED)');

checarSemErrosNaoTratados(erros, 'leitor_documentos_auditoria_ui');
relatorioFinal('leitor_documentos_auditoria_ui');
