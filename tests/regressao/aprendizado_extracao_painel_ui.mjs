// Painel "ensinar o leitor" (formulário de nota, painel lateral estilo
// chat): quando o leitor de documentos não acha um campo, o painel
// pergunta e oferece candidatos como resposta rápida (chip); a resposta
// corrige a nota atual na hora e, quando o fornecedor já foi escolhido
// (ou é escolhido logo depois), vira uma dica salva por fornecedor (ver
// aprendizado_extracao.js/db.salvarExtracaoHint) -- reaplicada
// automaticamente na próxima nota do mesmo fornecedor.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.departamento);
global.File = dom.window.File;
const { app } = await import('./app/src/js/state.js');
const { reclassificarComHints } = await import('./app/src/js/leitor_documentos.js');

document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));

// 1) Simula um anexo já lido, com o VALOR faltando -- mesma técnica de
// leitor_documentos_auditoria_ui.mjs (escreve direto em
// app.anexosAnalises, no formato que analisarAnexo() de verdade produz).
const textoDoc = 'DANFE NOTA FISCAL\nNumero do documento: 000555\nValor a pagar: R$ 777,00';
app.anexosNovos.push(new dom.window.File(['conteudo'], 'nf-aprendizado.pdf', { type: 'application/pdf' }));
app.anexosAnalises.push({
  status: 'pronto',
  respondido: [],
  resultado: { nomeArquivo: 'nf-aprendizado.pdf', fonte: 'pdf_texto', tipoDetectado: 'nota_fiscal', texto: textoDoc, campos: { numeroNota: '000555' } },
});
// dispara um refresh (mesmo mecanismo dos outros testes: efeito colateral
// de um campo mudando, não existe uma função exportada só pra isso).
document.getElementById('nf-tipo-contratacao').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 30));

// 2) O painel lateral pergunta sobre o valor faltando, com "777,00" como
// candidato (achado no texto via regex de R$).
checar(document.body.textContent.includes('Não achei o valor'), 'painel pergunta sobre o valor que não foi achado');
const chip = document.querySelector('[data-chat-resposta$=":valor:777%2C00"]');
checar(!!chip, 'aparece um chip de resposta rápida com o valor candidato achado no texto (777,00)');

// 3) Clica no candidato -- corrige a nota atual na hora.
chip.click();
await new Promise(r => setTimeout(r, 30));
checarIgual(app.anexosAnalises[0].resultado.campos.valor, 777, 'clicar no candidato corrige o campo na análise atual (convertido pra número)');

// 4) Fornecedor ainda não tinha sido escolhido -- a resposta fica em fila
// (não tem pra qual fornecedor associar a dica ainda).
checarIgual(app.hintsPendentes.length, 1, 'resposta dada antes de escolher o fornecedor fica em fila (hintsPendentes)');
checarIgual(app.hintsPendentes[0].campo, 'valor', 'a fila guarda o campo respondido');

// 5) Escolhe o fornecedor pela combo de verdade (digita + clica no item da
// lista, mesmo fluxo que uma pessoa usaria) -- isso deve descarregar a
// fila como uma dica de verdade pro fornecedor escolhido.
const buscaInput = document.getElementById('nf-fornecedor-busca');
buscaInput.value = 'Teste 5';
buscaInput.dispatchEvent(new dom.window.Event('input'));
await new Promise(r => setTimeout(r, 10));
const itemCombo = document.querySelector('.combo-item[data-id="forn-5"]');
checar(!!itemCombo, 'a busca de fornecedor acha "Fornecedor Teste 5" (forn-5) na lista');
itemCombo.dispatchEvent(new dom.window.Event('mousedown', { bubbles: true }));
await new Promise(r => setTimeout(r, 30));

checarIgual(app.hintsPendentes.length, 0, 'ao escolher o fornecedor, a fila de respostas pendentes é descarregada');
const hintSalva = supabaseClientMod.__fixtures().fornecedor_extracao_hints.find(h => h.fornecedor_id === 'forn-5' && h.campo === 'valor');
checar(!!hintSalva, 'a dica de extração foi salva (upsert) associada ao fornecedor escolhido');
checar(hintSalva.ancora.includes('valor a pagar'), 'a âncora salva é o trecho de texto que precede o valor no documento');

// 6) A dica aprendida reaplica em OUTRO documento do MESMO fornecedor,
// com um valor diferente no mesmo tipo de rótulo -- é o ponto todo do
// recurso: aprender uma vez, reconhecer sozinho depois.
const textoOutraNota = 'DANFE NOTA FISCAL\nNumero do documento: 000777\nValor a pagar: R$ 42,10';
const hintsDoFornecedor = app.extracaoHints.filter(h => h.fornecedor_id === 'forn-5');
const reclassificado = reclassificarComHints(textoOutraNota, hintsDoFornecedor);
checarIgual(reclassificado.campos.valor, 42.1, 'a dica aprendida com o primeiro documento acha o valor certo em outro documento do mesmo fornecedor, sem perguntar de novo');

checarSemErrosNaoTratados(erros, 'aprendizado_extracao_painel_ui');
relatorioFinal('aprendizado_extracao_painel_ui');
