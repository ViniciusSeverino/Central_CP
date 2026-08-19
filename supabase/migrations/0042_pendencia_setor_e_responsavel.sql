-- supabase/migrations/0042_pendencia_setor_e_responsavel.sql
--
-- Dois pedidos relacionados do dono do produto:
--
-- 1) Bug real: "alguns perfis não conseguem devolver as pendências".
--    Causa -- a policy "notas: update" vigente (0038) só libera resolver
--    uma pendência (pendente=true, qualquer status) pra quem é o próprio
--    criado_por (ou delegado dele) -- um colega do MESMO setor que não
--    seja o autor original esbarra na RLS. A única exceção já era
--    status='recebido' ("qualquer recebedor pode resolver", 0029) -- este
--    migration extende o MESMO raciocínio pra qualquer pendência: dono
--    OU colega do mesmo setor, ambos podem corrigir e devolver.
--
-- 2) No botão de marcar pendência (contas a pagar devolvendo pro
--    departamento corrigir), o CP agora pode indicar opcionalmente um
--    "responsável principal" -- só um destaque informativo (quem o CP
--    entende que deve tratar primeiro), NÃO uma trava: qualquer um do
--    setor continua podendo resolver, por causa do item 1 acima.
alter table notas add column responsavel_pendencia_id uuid references usuarios(id);
comment on column notas.responsavel_pendencia_id is
  'Opcional -- quem o contas_a_pagar apontou como responsável principal ao marcar a pendência (só informativo/destaque na UI). Não restringe quem pode resolver: qualquer usuário do mesmo setor da nota continua podendo corrigir e devolver (ver "notas: update"). Limpo (volta a null) quando a pendência é resolvida, junto com motivo_pendencia.';

-- Reescreve "notas: update" por inteiro (reaplica todos os ramos de 0038),
-- só ampliando o ramo setor-wide do departamento: antes só "recebido",
-- agora também qualquer pendência (pendente=true), qualquer status.
drop policy if exists "notas: update" on notas;
create policy "notas: update" on notas for update
  using (
    eh_super_usuario()
    or (
      'departamento' = ANY(papeis_efetivos())
      and pode_agir_como(criado_por)
      and status in ('rascunho','rascunho_recebimento','lancado')
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

-- O formulário de "Corrigir e devolver" reaproveita a área de anexos
-- inteira (pode reanexar/substituir/remover) -- sem o mesmo alargamento
-- nas policies do bucket, o colega do setor conseguiria editar os DADOS
-- da nota (RLS de notas acima já libera) mas travaria ao mexer no anexo,
-- um bug tão real quanto o que este migration corrige. Mesma extensão:
-- dono OU colega do mesmo setor com pendência aberta, além do que já
-- existia (recebido por setor, contas_a_pagar, super_usuario).
drop policy if exists "anexos-notas: insert" on storage.objects;
create policy "anexos-notas: insert" on storage.objects for insert
  with check (
    bucket_id = 'anexos-notas'
    and exists (
      select 1 from notas n
      where n.id::text = (storage.foldername(name))[1]
      and (
        eh_super_usuario()
        or ('departamento' = ANY(papeis_efetivos()) and pode_agir_como(n.criado_por))
        or ('departamento' = ANY(papeis_efetivos()) and n.setor = (select setor from usuario_atual()) and (n.status = 'recebido' or n.pendente = true))
        or ('contas_a_pagar' = ANY(papeis_efetivos()) and (n.status <> 'rascunho' or pode_agir_como(n.criado_por)))
      )
    )
  );

drop policy if exists "anexos-notas: delete" on storage.objects;
create policy "anexos-notas: delete" on storage.objects for delete
  using (
    bucket_id = 'anexos-notas'
    and exists (
      select 1 from notas n
      where n.id::text = (storage.foldername(name))[1]
      and (
        eh_super_usuario()
        or ('departamento' = ANY(papeis_efetivos()) and pode_agir_como(n.criado_por))
        or ('departamento' = ANY(papeis_efetivos()) and n.setor = (select setor from usuario_atual()) and (n.status = 'recebido' or n.pendente = true))
        or ('contas_a_pagar' = ANY(papeis_efetivos()) and (n.status <> 'rascunho' or pode_agir_como(n.criado_por)))
      )
    )
  );
