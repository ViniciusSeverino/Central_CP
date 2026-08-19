-- supabase/migrations/0041_anexos_visibilidade_global.sql
--
-- Bug relatado pelos usuários: "todo mundo precisa conseguir ver e baixar
-- os anexos, independente de quem lançou". A causa: "notas: select" (ver
-- 0024_cp_lanca_para_financeiro_e_todas_notas_geral) já liberou pro
-- departamento ver QUALQUER nota que não seja rascunho de outro alguém --
-- "Todas as notas", vale pra qualquer setor -- mas as policies do bucket
-- "anexos-notas" (0011, reescritas em 0029/0040 só pra outros gaps) nunca
-- acompanharam essa mudança: continuavam travadas em
-- pode_agir_como(n.criado_por), então dava pra VER a nota na lista mas não
-- baixar o anexo dela. Reescreve só "anexos-notas: select" espelhando
-- literalmente a condição vigente de "notas: select" -- insert/delete do
-- bucket continuam como estão (quem pode EDITAR a nota, não quem só a
-- enxerga, ver 0040), pedido foi só de visualizar/baixar.
drop policy if exists "anexos-notas: select" on storage.objects;
create policy "anexos-notas: select" on storage.objects for select
  using (
    bucket_id = 'anexos-notas'
    and exists (
      select 1 from notas n
      where n.id::text = (storage.foldername(name))[1]
      and (
        eh_super_usuario()
        or ('departamento' = ANY(papeis_efetivos()) and (pode_agir_como(n.criado_por) or n.status <> 'rascunho'))
        or ('contas_a_pagar' = ANY(papeis_efetivos()) and (n.status <> 'rascunho' or pode_agir_como(n.criado_por)))
      )
    )
  );
