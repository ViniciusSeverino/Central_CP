-- Central CP — migration 0032: RLS do status 'rascunho_recebimento'
-- Parte da sequência em supabase/migrations/ — aplique em ordem numérica
-- num banco novo (ver README.md, seção "Como colocar para rodar").
--
-- Reaplica as policies inteiras (mesmo padrão de 0029/0023 — são as
-- versões vigentes), só acrescentando o status novo onde o rascunho do
-- recebedor precisa de exatamente o mesmo tratamento do rascunho comum:
-- só o próprio dono (direto ou por delegação) mexe, e só antes de virar
-- 'recebido' de verdade. SELECT não precisa mudar: o departamento já
-- enxerga qualquer nota que não seja rascunho de outro (0024), esse status
-- novo já cai na mesma regra (é só mais um "rascunho" pra esse fim).

-- ---------------------------------------------------------------------
-- UPDATE: dono edita o próprio rascunho_recebimento (salvar de novo,
-- continuar depois) e o transiciona pra 'recebido' quando enviar pra
-- complementação.
-- ---------------------------------------------------------------------
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
      and status in ('aprovado','lancado_no_group','chamado_aberto','validado_csc')
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
      and status in ('aprovado','lancado_no_group','chamado_aberto','validado_csc','pago')
    )
    or (
      'contas_a_pagar' = ANY(papeis_efetivos())
      and pode_agir_como(criado_por)
      and status in ('rascunho','lancado','aprovado','lancado_no_group','chamado_aberto','validado_csc')
    )
  );

-- ---------------------------------------------------------------------
-- DELETE: dono exclui o próprio rascunho_recebimento (nunca foi enviado),
-- mesmo raciocínio do rascunho comum.
-- ---------------------------------------------------------------------
drop policy if exists "notas: delete" on notas;
create policy "notas: delete" on notas for delete
  using (
    (
      'departamento' = ANY(papeis_efetivos())
      and pode_agir_como(criado_por)
      and status in ('rascunho','rascunho_recebimento')
    )
    or (
      eh_super_usuario()
      and status in ('rascunho', 'lancado', 'aprovado')
    )
    or (
      'administrador' = ANY(papeis_efetivos())
    )
  );
