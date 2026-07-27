// Pedido do dono do produto: o contas a pagar precisa poder (1) editar os
// dados de um lançamento que não é dele (exceto a classificação contábil,
// que fica travada), com toda alteração registrada no histórico, e (2)
// cancelar (soft, com histórico) um lançamento ANTES de chegar no Group --
// hoje só dava pra "Excluir" de vez (sem rastro) e só se fosse o próprio
// rascunho. Cobre também a nova aba "Lançamentos cancelados".
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros, supabaseClientMod } = await bootApp(PERFIS.contasAPagar);

// nota-1 (fixture): status 'lancado', criada por u-dept-1 (departamento,
// não contas_a_pagar) -- antes desta mudança, CP não tinha nem UPDATE
// liberado pela RLS nessa etapa pra uma nota que não é dele. "lancado"
// (aguardando aprovação do gerente/admin) não tem fila própria pro CP --
// só aparece em "Todas as notas".
document.querySelector('[data-view="todas"]').click();
await new Promise(r => setTimeout(r, 100));
document.querySelector('[data-open="nota-1"]').click();
await new Promise(r => setTimeout(r, 100));

console.log('\n### 1. Editar (exceto classificação) ###');
const btnEditar = document.querySelector('[data-action="editar_cp"][data-id="nota-1"]');
checar(!!btnEditar, 'CP vê o botão "Editar" numa nota que não é dele, em "lancado"');
btnEditar.click();
await new Promise(r => setTimeout(r, 100));

const fsClassificacao = document.getElementById('nf-classificacao').closest('fieldset');
// jsdom não implementa de verdade a cascata de "fieldset disabled" pros
// campos de dentro (o próprio <select> continua reportando disabled=false
// aqui, diferente de um navegador real) -- por isso a checagem é só no
// fieldset em si, que é o que formNovaNota de fato controla.
checar(!!fsClassificacao && fsClassificacao.disabled, 'a seção "Classificação contábil" vem travada (fieldset disabled) no modo de edição do CP');

// N° da NF vem de escapeHtml() no atributo value, que o jsdom não
// implementa de verdade (sempre esvazia -- mesmo bug conhecido documentado
// em outros testes desta suíte, ex: nome de card/fornecedor). Reatribui
// aqui pra simular o que já viria preenchido certo num navegador de
// verdade, e corrige o vencimento (algo que o CP legitimamente precisa
// poder ajustar).
document.getElementById('nf-numero').value = 'NF-1';
document.getElementById('nf-vencimento').value = '2026-08-20';
document.getElementById('btn-salvar-nota').click();
await new Promise(r => setTimeout(r, 150));

const nota1 = supabaseClientMod.__fixtures().notas.find(n => n.id === 'nota-1');
checarIgual(nota1.vencimento, '2026-08-20', 'vencimento foi atualizado');
checarIgual(nota1.status, 'lancado', 'status NÃO mudou -- editar não é uma transição de etapa');
checarIgual(nota1.classificacao, 'Compras', 'classificação continua a mesma (travada, nunca chega a ser tocada)');
const historicoNota1 = supabaseClientMod.__fixtures().nota_historico.filter(h => h.nota_id === 'nota-1');
const entradaEdicao = historicoNota1.find(h => h.acao === 'Editado pelo contas a pagar');
checar(!!entradaEdicao, 'uma entrada de histórico "Editado pelo contas a pagar" foi criada');
checar(!!entradaEdicao && entradaEdicao.detalhe.includes('Vencimento'), 'o detalhe do histórico menciona o campo que mudou (Vencimento)');

console.log('\n### 2. Cancelar lançamento pré-Group (nota-2, status "aprovado", não é do CP) ###');
document.querySelector('[data-view="todas"]').click();
await new Promise(r => setTimeout(r, 100));
document.querySelector('[data-open="nota-2"]').click();
await new Promise(r => setTimeout(r, 100));
const btnCancelar = document.querySelector('[data-action="cancelar_lancamento"][data-id="nota-2"]');
checar(!!btnCancelar, 'CP vê "Cancelar lançamento" numa nota "aprovado" (antes do Group) que não é dele');
btnCancelar.click();
await new Promise(r => setTimeout(r, 100));
document.getElementById('input-motivo-cancelamento').value = 'Nota emitida por engano';
document.getElementById('confirmar-cancelar-lancamento').click();
await new Promise(r => setTimeout(r, 150));

const nota2 = supabaseClientMod.__fixtures().notas.find(n => n.id === 'nota-2');
checarIgual(nota2.status, 'cancelada', 'nota-2 foi cancelada');
checarIgual(nota2.motivo_cancelamento, 'Nota emitida por engano', 'motivo do cancelamento foi salvo');
checarIgual(nota2.cancelado_por, PERFIS.contasAPagar.usuarioId, 'fica registrado quem cancelou');

console.log('\n### 3. Aba "Lançamentos cancelados" ###');
const nav = Array.from(document.querySelectorAll('.sb-nav [data-view]')).map(b => b.dataset.view);
checar(nav.includes('cancelados'), 'CP vê a aba "Lançamentos cancelados"');
document.querySelector('[data-view="cancelados"]').click();
await new Promise(r => setTimeout(r, 100));
// nota-10 já nasce cancelada no fixture; nota-2 acabou de ser cancelada agora.
checar(!!document.querySelector('[data-open="nota-10"]'), 'nota já cancelada no fixture aparece na aba');
checar(!!document.querySelector('[data-open="nota-2"]'), 'nota recém-cancelada também aparece na aba');
checar(!document.querySelector('[data-open="nota-1"]'), 'nota que só foi editada (não cancelada) não aparece aqui');

checarSemErrosNaoTratados(erros, 'cp_edita_e_cancela_lancamento');
relatorioFinal('cp_edita_e_cancela_lancamento');
