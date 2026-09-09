-- supabase/migrations/0051_notas_update_criador_com_pendencia.sql
--
-- Bug real: "Corrigir e devolver" mostra a mensagem de sucesso, o
-- histórico até registra "Pendência corrigida... e devolvida" (múltiplas
-- vezes, a cada tentativa), mas a nota nunca sai da fila de pendências --
-- o usuário reabre e a pendência continua lá, do mesmo jeito, e tenta de
-- novo (e de novo).
--
-- Causa: uma nota pode ser criada por alguém e pertencer a um setor
-- DIFERENTE do setor do próprio criador -- acontece quando um recebedor
-- de um setor completa o recebimento de uma nota recebida em nome de
-- outro setor (completarRecebimento reatribui criado_por pra quem
-- completou, mas o campo `setor` da nota continua o original). Nesse
-- caso, na hora de resolver uma pendência (status já avançado, ex.
-- 'aprovado', não é mais 'rascunho'/'lancado'):
--   - o ramo "colega de setor" de "notas: update" (USING) não bate --
--     setor da nota != setor do usuário;
--   - o ramo "dono da nota" (USING) também não bate -- só cobre status
--     em ('rascunho','rascunho_recebimento','lancado'), sem a válvula de
--     escape "ou pendente=true" que o ramo equivalente do contas_a_pagar
--     JÁ TINHA desde sempre (ver 0008) -- assimetria nunca notada porque
--     a maioria das notas tem setor igual ao do próprio criador.
-- Nenhum ramo libera o UPDATE -> a linha simplesmente fica de fora do
-- conjunto afetado pelo UPDATE, SEM ERRO NENHUM (RLS em UPDATE não
-- lança exceção quando USING exclui a linha, só afeta zero linhas) --
-- db.corrigirPendencia() só checava `error` (null) e seguia em frente
-- salvando rateio/imposto/histórico normalmente, então tudo "parecia"
-- ter funcionado, mas notas.pendente nunca virava false de verdade.
--
-- Correção: acrescenta a mesma válvula de escape "ou pendente = true"
-- que o ramo do contas_a_pagar já tem, no ramo do dono/departamento --
-- exatamente o comportamento que o comentário de promoverStatusNota
-- (db.js) já descrevia como esperado ("enquanto ela está em
-- 'rascunho'/'lancado' (ou pendente=true)") mas nunca tinha sido
-- implementado de verdade nessa branch.
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
      and (status = 'recebido' or pendente = true)
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
      and status in ('rascunho','rascunho_recebimento','lancado','aprovado','lancado_no_group','chamado_aberto','validado_csc')
    )
    or (
      'departamento' = ANY(papeis_efetivos())
      and setor = (select setor from usuario_atual())
      and status in ('recebido','lancado','aprovado','lancado_no_group','chamado_aberto','validado_csc')
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
