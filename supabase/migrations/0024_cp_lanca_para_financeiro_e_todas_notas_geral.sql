-- supabase/migrations/0024_cp_lanca_para_financeiro_e_todas_notas_geral.sql
--
-- Duas decisões do dono do produto:
--
-- 1) "Todas as notas" deixa de ser um recorte por dono pro departamento:
--    ele passa a ver TODOS os lançamentos que já saíram de rascunho,
--    independente de quem lançou -- igual contas_a_pagar/super_usuário já
--    enxergavam. Rascunho de outro continua privado (ainda não é um
--    lançamento real, não faz sentido expor pros outros).
--
-- 2) contas_a_pagar ganha a capacidade de lançar nota, mas só pro setor
--    Financeiro (departamento continua sendo quem lança pros outros
--    setores). Decisão explícita: NÃO auto-aprova só por quem lançou ser
--    contas_a_pagar -- segue a mesma alçada por valor que já existe pro
--    departamento (ver statusInicialParaValor em events_notas.js), pra
--    manter a separação entre quem lança e quem aprova/executa. Por isso
--    os branches novos de INSERT/UPDATE/DELETE pro "contas_a_pagar dono
--    da própria nota" espelham exatamente os mesmos do departamento, só
--    trocando o papel e travando setor = 'Financeiro' no insert.

drop policy if exists "notas: select" on notas;
create policy "notas: select" on notas for select
  using (
    eh_super_usuario()
    or (
      'departamento' = ANY(papeis_efetivos())
      and (pode_agir_como(criado_por) or status <> 'rascunho')
    )
    or (
      'contas_a_pagar' = ANY(papeis_efetivos())
      and (status <> 'rascunho' or pode_agir_como(criado_por))
    )
  );

drop policy if exists "notas: insert" on notas;
create policy "notas: insert" on notas for insert
  with check (
    (
      (select role from usuario_atual()) = 'departamento'
      and criado_por = (select id from usuario_atual())
      and setor = (select setor from usuario_atual())
    )
    or (
      eh_super_usuario()
      and criado_por = (select id from usuario_atual())
    )
    or (
      (select role from usuario_atual()) = 'contas_a_pagar'
      and criado_por = (select id from usuario_atual())
      and setor = 'Financeiro'
    )
  );

drop policy if exists "notas: update" on notas;
create policy "notas: update" on notas for update
  using (
    eh_super_usuario()
    or (
      'departamento' = ANY(papeis_efetivos())
      and pode_agir_como(criado_por)
      and (status in ('rascunho','lancado') or pendente = true)
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
      and status in ('rascunho','lancado','aprovado','lancado_no_group','chamado_aberto','validado_csc')
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

-- DELETE: reaplica a policy de 0023 (administrador em qualquer etapa) e
-- soma o mesmo tratamento simétrico do departamento pro contas_a_pagar
-- dono do próprio rascunho (nunca chegou a ser enviado).
drop policy if exists "notas: delete" on notas;
create policy "notas: delete" on notas for delete
  using (
    (
      'departamento' = ANY(papeis_efetivos())
      and pode_agir_como(criado_por)
      and status = 'rascunho'
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
