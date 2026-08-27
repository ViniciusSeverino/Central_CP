-- supabase/migrations/0050_pode_editar_nota_pos_update.sql
--
-- Bug real reportado: "Corrigir e devolver" numa nota com rateio ou
-- imposto retido dá "new row violates row-level security policy for
-- table nota_impostos/nota_rateios".
--
-- Causa: pode_editar_nota() (0045) foi copiada da condição de ABERTURA da
-- edição -- o USING de "notas: update" (0042), que responde "esse usuário
-- pode COMEÇAR a editar essa nota, no estado em que ela está agora?". Mas
-- salvarRateios/salvarImpostos (db.js) sempre rodam DEPOIS que o UPDATE em
-- `notas` já commitou -- e db.corrigirPendencia() faz esse UPDATE
-- colocando pendente=false na mesma chamada. No momento em que
-- pode_editar_nota() lê a linha pra liberar o insert de
-- nota_rateios/nota_impostos, pendente já é false e o status normalmente
-- não é mais 'recebido' -- a condição do colega de setor
-- ("status='recebido' OU pendente=true", pensada pra checar o estado
-- ANTES do update) já não bate mais com o estado ATUAL (depois do
-- update), e o insert é barrado.
--
-- Correção: troca a condição de pode_editar_nota() pela do WITH CHECK de
-- "notas: update" (a pergunta certa pra esse momento: "o estado ATUAL
-- dessa nota é um resultado válido de uma edição desse usuário?") em vez
-- do USING. É seguro por construção -- o estado atual da nota só existe
-- porque uma escrita anterior (INSERT ou UPDATE) já passou por essa mesma
-- checagem; nunca fica mais permissivo do que a própria tabela `notas`
-- já permite.
create or replace function pode_editar_nota(p_nota_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from notas n
    where n.id = p_nota_id
    and (
      eh_super_usuario()
      or (
        'departamento' = ANY(papeis_efetivos())
        and pode_agir_como(n.criado_por)
        and n.status in ('rascunho','rascunho_recebimento','lancado','aprovado','lancado_no_group','chamado_aberto','validado_csc')
      )
      or (
        'departamento' = ANY(papeis_efetivos())
        and n.setor = (select setor from usuario_atual())
        and n.status in ('recebido','lancado','aprovado','lancado_no_group','chamado_aberto','validado_csc')
      )
      or (
        'contas_a_pagar' = ANY(papeis_efetivos())
        and n.status in ('lancado','aprovado','lancado_no_group','chamado_aberto','validado_csc','pago','cancelada')
      )
      or (
        'contas_a_pagar' = ANY(papeis_efetivos())
        and pode_agir_como(n.criado_por)
        and n.status in ('rascunho','lancado','aprovado','lancado_no_group','chamado_aberto','validado_csc')
      )
    )
  );
$$;

comment on function pode_editar_nota(uuid) is
  'Espelha o WITH CHECK (não o USING) de "notas: update" -- de propósito: essa função é sempre chamada DEPOIS que a linha de `notas` já foi escrita (salvarRateios/salvarImpostos rodam depois do UPDATE em criarNota/atualizarNota/completarRecebimento/corrigirPendencia), então a pergunta certa é "esse é um resultado válido de escrita?", não "dava pra começar a editar, no estado de antes?". Se "notas: update" mudar de novo, atualize aqui também (as duas cláusulas, USING e WITH CHECK).';
