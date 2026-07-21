// Perfil "recebedor" (ver migration 0029/ui_recebimento.js): um nível mais
// simples dentro do role departamento, pra quem só recebe o documento do
// fornecedor na prática -- anexa e informa a classificação (centro de
// custo/classe/código), não lança a nota inteira. Cobre: botão certo na
// sidebar, validação do formulário simplificado, pré-preenchimento ao
// corrigir uma devolução, e a persistência (db.criarNota/corrigirPendencia)
// chamada direto -- ver nota abaixo sobre por que não clicamos "salvar" de
// verdade com anexo presente.
//
// NOTA IMPORTANTE sobre anexos nesta suíte: finalizarAnexos() (events_
// notas.js) só devolve [] direto quando NÃO sobra nenhum anexo (nem
// existente nem novo) -- qualquer anexo presente aciona mesclarAnexosEm
// PdfUnico() (anexos_pdf.js), que importa 'pdf-lib' via URL do esm.sh. O
// loader padrão do Node (usado por todo o harness de testes, fora de um
// navegador de verdade) não sabe importar URLs https:// -- por isso NENHUM
// teste desta suíte (nem os de outras features) clica em "salvar" com um
// anexo de verdade presente; a chamada ao Supabase que persiste os dados é
// testada direto (db.criarNota/corrigirPendencia), sem passar pelo merge
// de PDF, que só roda de verdade num navegador (documentado aqui pra não
// parecer lacuna de cobertura -- é uma limitação do ambiente de teste, não
// do app).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.departamentoRecebedor);
const { app } = await import('./app/src/js/state.js');
const db = await import('./app/src/js/db.js');

// 1) Sidebar: recebedor vê "+ Anexar documento", não "+ Nova nota" nem
// "Lançar em lote" (essas duas são do perfil "completo").
checar(!!document.getElementById('btn-novo-recebimento'), 'recebedor vê o botão "+ Anexar documento"');
checar(!document.getElementById('btn-nova-nota'), 'recebedor NÃO vê "+ Nova nota" (não lança a nota inteira)');
checar(!document.getElementById('btn-lote-nota'), 'recebedor NÃO vê "Lançar em lote"');

// 2) Nav "Recebidos": conta as 2 notas 'recebido' do próprio setor
// (Marketing) do fixture -- fila do setor inteiro, não só o que essa
// pessoa criou (ambas foram criadas por ela mesma no fixture, mas a
// contagem não filtra por criado_por).
const nav = Array.from(document.querySelectorAll('.sb-nav [data-view]')).map(b => b.dataset.view);
checar(nav.includes('recebidos'), 'recebedor vê a aba "Recebidos"');
const contadorRecebidos = document.querySelector('[data-view="recebidos"] .count');
checarIgual(contadorRecebidos.textContent, '2', 'contador de "Recebidos" soma as 2 notas recebido do setor Marketing');

// 3) Abrir "+ Anexar documento": formulário simplificado.
document.getElementById('btn-novo-recebimento').click();
await new Promise(r => setTimeout(r, 100));
checar(!!document.getElementById('nf-centro-custo'), 'formulário simplificado tem o campo centro de custo');
checar(!document.getElementById('nf-valor'), 'formulário simplificado NÃO tem campo de valor (isso é do "completo")');
checar(!document.getElementById('nf-vencimento'), 'formulário simplificado NÃO tem campo de vencimento');
checarIgual(document.getElementById('btn-salvar-recebimento').textContent, 'Enviar para complementação', 'rótulo do botão de salvar é o de criação');
checar(!!document.getElementById('btn-salvar-recebimento-rascunho'), 'formulário simplificado tem a opção "Salvar como rascunho"');

// 3b) Pagador (pedido do dono do produto): campo próprio, pré-preenchido
// pelo setor de quem está lançando (Marketing -> FPP, ver
// pagadorPadraoParaSetor em state.js) -- filtra o centro de custo a
// seguir, por isso cc-1 (só aceita origem COND) não aparece mais como
// opção depois desse pré-preenchimento.
checar(!!document.getElementById('nf-pagador'), 'formulário simplificado tem o campo pagador');
checarIgual(document.getElementById('nf-pagador').value, 'pag-2', 'pagador vem pré-preenchido pelo setor (Marketing -> FPP)');
checar(!Array.from(document.getElementById('nf-centro-custo').options).some(o => o.value === 'cc-1'), 'com o pagador FPP pré-preenchido, cc-1 (só aceita origem COND) não aparece como opção');

// 4) Validação: sem centro/classe, o clique é bloqueado com toast (não
// chega a tentar salvar nada). Pagador já veio preenchido (passo acima),
// então o toast aqui é especificamente sobre centro de custo/classe.
document.getElementById('btn-salvar-recebimento').click();
await new Promise(r => setTimeout(r, 50));
checar(Array.from(document.querySelectorAll('.toast')).pop().textContent.includes('centro de custo'), 'sem centro de custo/classe, mostra toast pedindo pra selecionar');

// 5) Preenche centro/classe mas sem anexo -- bloqueado por outro toast,
// SEM clicar de fato até o ponto de mesclar PDF (nenhum arquivo foi
// escolhido, então não tem o que mesclar de qualquer forma). cc-2 (não
// cc-1) porque é o que sobra disponível com o pagador FPP pré-preenchido.
document.getElementById('nf-centro-custo').value = 'cc-2';
document.getElementById('nf-centro-custo').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
document.getElementById('nf-classe-conta').value = 'cl-2';
document.getElementById('btn-salvar-recebimento').click();
await new Promise(r => setTimeout(r, 50));
checar(Array.from(document.querySelectorAll('.toast')).pop().textContent.includes('Anexe'), 'sem nenhum documento anexado, mostra toast pedindo pra anexar');

// Fecha o formulário de criação antes de abrir o detalhe de outra nota --
// enquanto um modal de página cheia está aberto, o card da fila não está
// no DOM (ver renderShell/FULL_PAGE_MODALS).
document.getElementById('modal-close').click();
await new Promise(r => setTimeout(r, 100));

// 6) "Corrigir e devolver" numa nota devolvida (pendente=true) -- abre o
// mesmo formulário simplificado, pré-preenchido, mostrando o motivo.
document.querySelector('[data-open="nota-recebida-pendente-1"]').click();
await new Promise(r => setTimeout(r, 100));
checar(!!document.querySelector('[data-action="corrigir_recebimento"][data-id="nota-recebida-pendente-1"]'), 'nota "recebido" pendente mostra o botão "Corrigir e devolver"');
checar(!document.querySelector('[data-action="completar_recebimento"]'), 'nota pendente NÃO mostra "Completar lançamento" (primeiro resolve a pendência)');
document.querySelector('[data-action="corrigir_recebimento"][data-id="nota-recebida-pendente-1"]').click();
await new Promise(r => setTimeout(r, 100));
// O texto do motivo vem de escapeHtml() (via innerText), que o jsdom não
// implementa de verdade -- sempre devolve string vazia nesse ambiente
// (bug conhecido do jsdom, documentado em vários outros testes desta
// suíte). Checagem estrutural: o bloco de aviso existe.
checar(!!document.querySelector('#box-recebimento .err-msg'), 'formulário de correção mostra o bloco com o motivo da devolução');
checarIgual(document.getElementById('nf-centro-custo').value, 'cc-1', 'formulário de correção vem pré-preenchido com o centro de custo já informado antes');
checarIgual(document.getElementById('btn-salvar-recebimento').textContent, 'Corrigir e devolver', 'rótulo do botão de salvar é o de correção');

// 7) Persistência de verdade -- direto no db.js, sem passar pela mescla de
// PDF (ver nota no topo do arquivo).
const novaNota = await db.criarNota(
  { centro_custo_id: 'cc-1', classe_conta_id: 'cl-1', codigo_classificacao_id: null, fornecedor_id: null, descricao: 'teste recebimento', anexos: ['nota-teste-criar/doc.pdf'], setor: app.usuario.setor },
  app.usuario, 'recebido', [{ acao: 'Documento recebido, enviado para complementação' }],
);
checar(!!novaNota, 'db.criarNota criou a nota com status recebido');
checarIgual(novaNota.status, 'recebido', 'status inicial é "recebido"');
checarIgual(novaNota.setor, 'Marketing', 'setor vem do próprio usuário (recebedor)');
checarIgual(novaNota.criado_por, PERFIS.departamentoRecebedor.usuarioId, 'fica registrada em nome do recebedor');

await db.corrigirPendencia(
  'nota-recebida-pendente-1',
  { centro_custo_id: 'cc-1', classe_conta_id: 'cl-1', codigo_classificacao_id: null, fornecedor_id: null, descricao: null, anexos: ['nota-recebida-pendente-1/456-boleto-novo.pdf'] },
  app.usuario, null, [{ acao: 'Documento corrigido e devolvido pelo recebedor' }],
);
const corrigida = supabaseClientMod.__fixtures().notas.find(n => n.id === 'nota-recebida-pendente-1');
checarIgual(corrigida.pendente, false, 'corrigir e devolver limpa a flag de pendente');
checarIgual(corrigida.motivo_pendencia, null, 'corrigir e devolver limpa o motivo');
checarIgual(corrigida.status, 'recebido', 'continua "recebido" -- só resolveu a pendência, ainda não foi completada');

checarSemErrosNaoTratados(erros, 'recebimento_perfil_recebedor');
relatorioFinal('recebimento_perfil_recebedor');
