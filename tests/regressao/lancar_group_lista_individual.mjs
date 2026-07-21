// "Lançar no Group" não agrupa mais por pagador+vencimento nem tem ação
// em lote (decisão do dono do produto: cada nota tem um código PRÓPRIO no
// Group, diferente dos outros 3 estágios do contas a pagar, onde um
// chamado/validação/pagamento de verdade cobre várias notas de uma vez).
// Cobre: lista simples (sem checkbox nem "selecionar todas"), botão
// individual por nota, e que confirmar o código de uma nota não afeta as
// outras.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros, supabaseClientMod } = await bootApp(PERFIS.contasAPagar);

document.querySelector('[data-view="lancar_group"]').click();
await new Promise(r => setTimeout(r, 100));

checar(!document.querySelector('.grupo-select-links'), '"Lançar no Group" não mostra "Selecionar todas/Nenhuma" (sem ação em lote)');
checar(!document.querySelector('input.grupo-check'), '"Lançar no Group" não mostra checkbox de seleção');
checar(!document.querySelector('[data-lote-group]'), 'nenhum botão de ação em lote (data-lote-group) nessa fila');

const botoes = Array.from(document.querySelectorAll('[data-lote-action="lote_lancar_group"]'));
checar(botoes.length >= 2, 'cada nota aprovada tem seu próprio botão "Lançar no Group" (nota-2 e nota-3 do fixture)');
botoes.forEach(b => {
  checar(!b.dataset.loteIds.includes(','), `botão individual (${b.dataset.loteIds}) tem só um id, nunca uma lista`);
});

// Fornecedor em pré-cadastro (ver migration 0030): a nota aprovada dele
// (nota-fornecedor-pendente-1) fica de fora dessa fila.
checar(!document.querySelector('[data-lote-action="lote_lancar_group"][data-lote-ids="nota-fornecedor-pendente-1"]'), 'nota com fornecedor em pré-cadastro não aparece em "Lançar no Group"');

// Confirma o código de nota-2 -- só ela deve ganhar o código, nota-3 continua sem.
document.querySelector('[data-lote-action="lote_lancar_group"][data-lote-ids="nota-2"]').click();
await new Promise(r => setTimeout(r, 100));
document.getElementById('input-lancamento-group').value = 'GRP-NOTA-2';
document.getElementById('confirmar-lote-lancar-group').click();
await new Promise(r => setTimeout(r, 150));

const nota2 = supabaseClientMod.__fixtures().notas.find(n => n.id === 'nota-2');
const nota3 = supabaseClientMod.__fixtures().notas.find(n => n.id === 'nota-3');
checarIgual(nota2.numero_lancamento_group, 'GRP-NOTA-2', 'nota-2 recebeu o código individual dela');
checarIgual(nota2.status, 'lancado_no_group', 'nota-2 avançou de status');
checar(!nota3.numero_lancamento_group, 'nota-3 continua sem código -- código de uma nota não vaza pra outra');
checarIgual(nota3.status, 'aprovado', 'nota-3 continua em "aprovado", não avançou junto');

checarSemErrosNaoTratados(erros, 'lancar_group_lista_individual');
relatorioFinal('lancar_group_lista_individual');
