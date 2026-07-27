-- supabase/migrations/0038_cp_edita_e_cancela_pre_group.sql
--
-- Pedido do dono do produto: o contas a pagar precisa poder (1) editar os
-- dados de uma nota já lançada (não só as 4 ações de etapa) e (2) cancelar
-- (soft, com histórico) um lançamento ainda ANTES de chegar no Group --
-- hoje as duas coisas esbarram na RLS antes mesmo de chegar na UI:
--
--   - o ramo "contas_a_pagar geral" (qualquer nota, sem precisar ser
--     delegado do criador) da policy "notas: update" (versão vigente em
--     0032) só cobre status em ('aprovado','lancado_no_group',
--     'chamado_aberto','validado_csc') -- falta 'lancado' (a etapa
--     "Aguardando aprovação"), que é justamente uma das "antes do Group".
--   - o with check desse mesmo ramo vai até 'pago' mas nem inclui
--     'lancado' nem 'cancelada' -- então mesmo COM o using acima
--     liberado, um UPDATE que preserva o status em 'lancado' (edição sem
--     mudar de etapa) ou que muda pra 'cancelada' (cancelamento) seria
--     barrado pelo Postgres na hora de reconferir a linha nova.
--
-- Reescreve a policy inteira (não dá pra "adicionar" a uma policy
-- existente) -- reaplica TODOS os ramos exatamente como estão em 0032
-- (delegação de departamento, recebedor por setor, delegação de CP), só
-- alterando o ramo "contas_a_pagar geral" (using + with check).
drop policy if exists "notas: update" on notas;
create policy "notas: update" on notas for update
  using (
    eh_super_usuario()
    or (
      'departamento' = ANY(papeis_efetivos())
      and pode_agir_como(criado_por)
      and (status in ('rascunho','rascunho_recebimento','lancado') or pendente = true)
    )
    or (
      'departamento' = ANY(papeis_efetivos())
      and setor = (select setor from usuario_atual())
      and status = 'recebido'
    )
    or (
      'contas_a_pagar' = ANY(papeis_efetivos())
      and status in ('lancado','aprovado','lancado_no_group','chamado_aberto','validado_csc')
    )
    or (
      'contas_a_pagar' = ANY(papeis_efetivos())
      and pode_agir_como(criado_por)
      and (status in ('rascunho','lancado') or pendente = true)
    )
  )
  with check (
    eh_super_usuario()
    or (
      'departamento' = ANY(papeis_efetivos())
      and pode_agir_como(criado_por)
      and status in ('rascunho','rascunho_recebimento','recebido','lancado','aprovado','lancado_no_group','chamado_aberto','validado_csc')
    )
    or (
      'departamento' = ANY(papeis_efetivos())
      and setor = (select setor from usuario_atual())
      and status in ('recebido','lancado','aprovado')
    )
    or (
      'contas_a_pagar' = ANY(papeis_efetivos())
      and status in ('lancado','aprovado','lancado_no_group','chamado_aberto','validado_csc','pago','cancelada')
    )
    or (
      'contas_a_pagar' = ANY(papeis_efetivos())
      and pode_agir_como(criado_por)
      and status in ('rascunho','lancado','aprovado','lancado_no_group','chamado_aberto','validado_csc')
    )
  );

-- Cancelar uma nota que ainda nem chegou no Group ('lancado'/'aprovado')
-- continua bloqueado se já estiver paga pelo mesmo trigger de sempre
-- (bloquear_cancelamento_de_paga, migration 0008) -- não precisa de nada
-- novo aqui, o trigger já existe e cobre qualquer transição pra
-- 'cancelada' vinda de 'pago', independente de quem faz o UPDATE.
