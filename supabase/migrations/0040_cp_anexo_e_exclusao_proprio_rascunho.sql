-- supabase/migrations/0040_cp_anexo_e_exclusao_proprio_rascunho.sql
--
-- Bug real relatado pelo dono do produto: "o perfil do CP não está
-- conseguindo lançar notas -- está indo pra rascunho, e não está sendo
-- possível excluir os rascunhos também." Investigação nos logs de
-- produção confirmou DOIS gaps de RLS, nenhum dos dois introduzido pela
-- migration anterior (0038) -- já existiam:
--
-- 1) storage.objects (bucket anexos-notas): toda nota nova nasce como
--    'rascunho' e só é promovida pro status de verdade DEPOIS de anexar
--    os arquivos (ver comentário em db.js/promoverStatusNota -- é
--    proposital, pro UPDATE de anexar não esbarrar na RLS de notas). Mas
--    as policies do bucket (migration 0011) só liberam contas_a_pagar
--    quando "n.status <> 'rascunho'" -- ou seja, CP nunca conseguia
--    sequer FAZER UPLOAD do próprio anexo enquanto a nota (seguindo o
--    fluxo normal) ainda estava em rascunho. O upload falhava com 400,
--    a promoção de status nunca era alcançada (o código nem chega lá --
--    ver finalizarAnexos/promoverStatusNota em events_notas.js), e a
--    nota ficava presa em rascunho pra sempre. departamento já tinha
--    esse escape via pode_agir_como(n.criado_por) (não trava por
--    status); contas_a_pagar precisa do mesmo pro caso "é a minha
--    própria nota".
--
-- 2) notas: delete: a policy foi reescrita por completo em 0032
--    (rascunho_recebimento_rls) e, sem querer, não trouxe de volta o
--    ramo "contas_a_pagar exclui o PRÓPRIO rascunho" que a migration
--    0024 (cp_lanca_para_financeiro_e_todas_notas_geral) tinha
--    introduzido -- desde então CP não consegue apagar os rascunhos
--    perdidos que a bug (1) foi deixando pra trás (o DELETE nem dá erro:
--    a RLS filtra a linha e o Postgres/PostgREST responde 204 sem
--    apagar nada, silenciosamente).
--
-- Reescreve as 3 policies do bucket (insert/select/delete) e a de
-- "notas: delete" por inteiro, preservando todos os ramos existentes.

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
        or ('departamento' = ANY(papeis_efetivos()) and n.setor = (select setor from usuario_atual()) and n.status = 'recebido')
        or ('contas_a_pagar' = ANY(papeis_efetivos()) and (n.status <> 'rascunho' or pode_agir_como(n.criado_por)))
      )
    )
  );

drop policy if exists "anexos-notas: select" on storage.objects;
create policy "anexos-notas: select" on storage.objects for select
  using (
    bucket_id = 'anexos-notas'
    and exists (
      select 1 from notas n
      where n.id::text = (storage.foldername(name))[1]
      and (
        eh_super_usuario()
        or ('departamento' = ANY(papeis_efetivos()) and pode_agir_como(n.criado_por))
        or ('departamento' = ANY(papeis_efetivos()) and n.setor = (select setor from usuario_atual()) and n.status = 'recebido')
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
        or ('departamento' = ANY(papeis_efetivos()) and n.setor = (select setor from usuario_atual()) and n.status = 'recebido')
        or ('contas_a_pagar' = ANY(papeis_efetivos()) and (n.status <> 'rascunho' or pode_agir_como(n.criado_por)))
      )
    )
  );

-- Restaura o ramo "contas_a_pagar exclui o próprio rascunho" (existia em
-- 0024, perdido em 0032) -- todos os outros ramos ficam exatamente como
-- estão hoje em produção (0036).
drop policy if exists "notas: delete" on notas;
create policy "notas: delete" on notas for delete
  using (
    (
      'departamento' = ANY(papeis_efetivos())
      and pode_agir_como(criado_por)
      and status in ('rascunho','rascunho_recebimento')
    )
    or (
      'departamento' = ANY(papeis_efetivos())
      and (select perfil_departamento from usuario_atual()) = 'completo'
      and setor = (select setor from usuario_atual())
      and status = 'recebido'
    )
    or (
      'contas_a_pagar' = ANY(papeis_efetivos())
      and pode_agir_como(criado_por)
      and status = 'rascunho'
    )
    or (
      eh_super_usuario()
      and status in ('rascunho', 'lancado', 'aprovado')
    )
    or (
      'administrador' = ANY(papeis_efetivos())
    )
  );
