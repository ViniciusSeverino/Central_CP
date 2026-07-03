-- Central CP — migration 0008: policies de notas + trigger anti-cancelamento de paga
-- Parte da sequência em supabase/migrations/ — aplique em ordem numérica
-- num banco novo (ver README.md, seção "Como colocar para rodar").

-- ---------------------------------------------------------------------
-- NOTAS — aqui sim a regra de negócio importa de verdade.
--
-- 'gestor' setor-scoped não existe mais: administrador e gerente_financeiro
-- (eh_super_usuario()) têm acesso total — veem tudo (inclusive rascunho),
-- aprovam e também executam as 4 ações do contas a pagar. papeis_efetivos()
-- e pode_agir_como() (ver bloco DELEGAÇÕES acima) incorporam delegação
-- ativa automaticamente, então nenhuma policy abaixo precisa saber que
-- delegação existe — só usa essas duas funções em vez de checar role/dono
-- direto.
-- ---------------------------------------------------------------------

-- SELECT:
--   super_usuario  → tudo, inclusive rascunho
--   departamento   → só as próprias (ou de quem te delegou), qualquer status
--   contas_a_pagar → todas, exceto rascunho
create policy "notas: select" on notas for select
  using (
    eh_super_usuario()
    or (
      'departamento' = ANY(papeis_efetivos())
      and pode_agir_como(criado_por)
    )
    or (
      'contas_a_pagar' = ANY(papeis_efetivos())
      and status <> 'rascunho'
    )
  );

-- INSERT:
--   departamento    → só em seu próprio nome/setor (delegação não cobre
--     criar nota nova em nome de outro — só processar o que já existe;
--     ver comentário na policy de update).
--   super_usuario (administrador/gerente_financeiro) → também lançam do
--     início ao fim. Não têm setor fixo (isentos pela constraint
--     setor_obrigatorio_exceto_cap), então não dá pra exigir
--     setor = setor do usuário como no ramo do departamento — a UI pede
--     pra eles escolherem o setor na hora; aqui só garante que a nota
--     fica em nome de quem está de fato logado.
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
  );

-- UPDATE:
--   super_usuario (administrador/gerente_financeiro) → qualquer transição,
--     em qualquer etapa — inclusive pular direto pra 'pago' se precisar
--     corrigir algo.
--   departamento (dono, direto ou por delegação) → enquanto rascunho/lancado
--     (fluxo normal de envio), OU em qualquer etapa pós-aprovação enquanto
--     pendente=true — é assim que corrige os dados e devolve a nota depois
--     que o contas_a_pagar marca uma pendência.
--   contas_a_pagar → aprovado -> lancado_no_group -> chamado_aberto ->
--     validado_csc -> pago, uma etapa de cada vez, podendo marcar
--     pendente=true em qualquer uma dessas 4 etapas.
--
-- IMPORTANTE: sem um WITH CHECK explícito, o Postgres reaplica o USING acima
-- contra a linha NOVA (pós-update) — o que bloquearia toda transição de
-- status real. O WITH CHECK abaixo é deliberadamente mais permissivo que o
-- USING, liberando os status de destino válidos para cada papel. A única
-- garantia forte que continua no banco pro departamento comum: ele nunca
-- consegue levar uma nota até 'pago' sozinho, mesmo "resolvendo" uma
-- pendência — esse status fica de fora do WITH CHECK dele (super_usuario
-- não tem essa restrição, por isso o ramo dele vem primeiro e sem status).
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
  );

-- DELETE ("excluir de vez", só pré-Group — depois disso existe uma
-- referência fora do Central CP, ver comentário no cancelamento acima):
--   departamento    → só o próprio rascunho (nunca foi enviado).
--   super_usuario   → rascunho, aguardando aprovação ou aprovada.
-- Da etapa "lançado no Group" em diante, a única saída é o cancelamento
-- (UPDATE pra status='cancelada'), que super_usuario já tem liberado pela
-- policy de update acima (sem restrição de status nesse ramo) — o único
-- reforço extra é o trigger abaixo, barrando cancelar uma nota já paga.
create policy "notas: delete" on notas for delete
  using (
    (
      'departamento' = ANY(papeis_efetivos())
      and pode_agir_como(criado_por)
      and status = 'rascunho'
    )
    or (
      eh_super_usuario()
      and status in ('rascunho', 'lancado', 'aprovado')
    )
  );

-- Uma nota já paga é uma transação financeira concluída — cancelar
-- corrigiria isso por fora do fluxo normal (precisaria de um processo de
-- estorno, que não existe ainda). Bloqueia só essa transição específica;
-- super_usuario continua podendo mover 'pago' pra outros status se
-- precisar corrigir algo (isso já existia e não é o que este trigger trata).
create or replace function bloquear_cancelamento_de_paga()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'pago' and new.status = 'cancelada' then
    raise exception 'Uma nota já paga não pode ser cancelada.';
  end if;
  return new;
end;
$$;

create trigger trg_bloquear_cancelamento_de_paga
  before update on notas
  for each row execute function bloquear_cancelamento_de_paga();
