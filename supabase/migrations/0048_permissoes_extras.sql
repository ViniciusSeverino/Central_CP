-- supabase/migrations/0048_permissoes_extras.sql
--
-- Painel de Controle de Acessos: permissões extras concedidas por usuário,
-- independentes do papel fixo dele (administrador/gerente_financeiro/
-- contas_a_pagar/departamento). Pedido do dono do produto: poder ligar/
-- desligar capacidades específicas por pessoa sem precisar de uma
-- alteração de código a cada combinação nova.
--
-- Desenho ADITIVO, não substitui nada: os 4 papéis e toda a RLS existente
-- continuam exatamente como estão -- isto aqui só ABRE mais uma condição
-- (OR) nos lugares certos, nunca fecha o que já funcionava.
--
-- Catálogo: lista de capacidades que EXISTEM como conceito -- conceder
-- uma capacidade a alguém só tem efeito de verdade se ela estiver
-- `ativa`. As 5 capacidades identificadas nesta conversa que ainda não
-- foram ligadas na RLS entram como `ativa=false` -- aparecem no painel
-- (pra não escapar do catálogo, o administrador já vê o que vem por aí),
-- mas o checkbox some desabilitado até uma migration futura ligá-las de
-- verdade. Evita a pior situação: marcar um checkbox achando que já
-- funciona e descobrir na produção que não tinha efeito nenhum.
create table permissoes_catalogo (
  chave text primary key,
  rotulo text not null,
  descricao text,
  ativa boolean not null default true
);

comment on table permissoes_catalogo is
  'Catálogo de capacidades concedíveis por usuário (ver usuario_permissoes) -- controla o painel "Controle de acessos" (Configurações). ativa=false: capacidade já mapeada mas ainda sem RLS ligada, aparece desabilitada no painel.';

alter table permissoes_catalogo enable row level security;
create policy "permissoes_catalogo: leitura" on permissoes_catalogo for select
  using (auth.role() = 'authenticated');
-- Sem policy de escrita pra ninguém além do superusuário do Postgres
-- (service_role) -- o catálogo em si só muda por migration, nunca pela UI.

-- Quem tem o quê. `setor`: null = vale pra TODOS os setores (escolha
-- explícita "Todos" na tela, não é o padrão implícito de uma linha vazia);
-- um valor = só aquele setor. Capacidade sem noção de setor (ex:
-- "Gerenciar cadastros") sempre grava null aqui.
create table usuario_permissoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  permissao_chave text not null references permissoes_catalogo(chave),
  setor setor_tipo,
  concedido_por uuid not null references usuarios(id),
  concedido_em timestamptz not null default now()
);

comment on column usuario_permissoes.setor is
  'null = vale pra todos os setores. Só é usado de verdade pelas capacidades "...de qualquer setor" (ver tem_permissao_extra) -- pras demais, sempre null.';

-- Evita duas linhas idênticas (mesmo usuário+capacidade+setor) -- coalesce
-- trata "Todos" (setor null) como um valor fixo pra fins de unicidade, já
-- que null <> null não bloqueia duplicata sozinho no Postgres.
create unique index usuario_permissoes_unica
  on usuario_permissoes (usuario_id, permissao_chave, coalesce(setor::text, '*'));
create index idx_usuario_permissoes_usuario on usuario_permissoes(usuario_id);

alter table usuario_permissoes enable row level security;

-- Leitura: qualquer autenticado -- o painel precisa listar tudo (é uma
-- tabela pequena, sem dado sensível além de "quem pode o quê", o próprio
-- app já expõe isso indiretamente via comportamento). Escrita: só
-- eh_administrador() -- de propósito NÃO eh_super_usuario() (que também
-- inclui gerente_financeiro): conceder permissão é o único ponto de
-- escalonamento de acesso do sistema todo, fica restrito ao papel mais
-- alto mesmo, sem exceção -- inclusive quem tiver a capacidade futura
-- "gerenciar_usuarios" (catálogo, ainda inativa) NÃO poderá conceder
-- permissão a ninguém, só administrador de verdade.
create policy "usuario_permissoes: leitura" on usuario_permissoes for select
  using (auth.role() = 'authenticated');
create policy "usuario_permissoes: escrita" on usuario_permissoes for all
  using (eh_administrador()) with check (eh_administrador());

-- p_setor omitido/null: pergunta "tem essa capacidade, em algum escopo?"
-- (usado pelas capacidades sem noção de setor, como aprovar_caixinha e
-- gerenciar_cadastros). Passando p_setor: pergunta "tem essa capacidade
-- PRA ESSE setor específico?" -- bate tanto com uma concessão "Todos"
-- (setor is null) quanto com uma concessão exata daquele setor.
create or replace function tem_permissao_extra(chave text, p_setor setor_tipo default null)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from usuario_permissoes up
    where up.usuario_id = (select id from usuario_atual())
    and up.permissao_chave = chave
    and (p_setor is null or up.setor is null or up.setor = p_setor)
  );
$$;

-- Seed: as 7 capacidades mapeadas na conversa com o dono do produto. Só
-- "gerenciar_cadastros" e "aprovar_caixinha" ligam de verdade nesta
-- migration (ver mudanças de RLS abaixo) -- as outras 5 ficam no catálogo
-- como `ativa=false` até uma migration futura de cada uma.
insert into permissoes_catalogo (chave, rotulo, descricao, ativa) values
  ('gerenciar_cadastros', 'Gerenciar cadastros',
   'Cadastrar e editar fornecedores, pagadores, centros de custo, classes de conta e códigos de classificação -- mesmo acesso que contas a pagar/gerente financeiro/administrador já têm.',
   true),
  ('aprovar_caixinha', 'Aprovar/rejeitar movimentação de caixinha',
   'Aprovar ou rejeitar saídas e reforços de qualquer caixinha, hoje restrito a administrador/gerente financeiro.',
   true),
  ('aprovar_notas', 'Aprovar notas',
   'Aprovar ou reprovar uma nota aguardando aprovação, hoje restrito a administrador/gerente financeiro.',
   false),
  ('etapas_contas_a_pagar', 'Executar etapas do contas a pagar',
   'Lançar no Group, abrir chamado, validar CSC e confirmar pagamento -- mesma condição de banco de "Editar lançamento de qualquer setor" (ver essa capacidade), concede as duas juntas.',
   false),
  ('editar_qualquer_nota', 'Editar lançamento de qualquer setor',
   'Editar os dados de uma nota que não criou, em qualquer setor -- mesma condição de banco de "Executar etapas do contas a pagar" (ver essa capacidade), concede as duas juntas.',
   false),
  ('resolver_pendencia_qualquer_setor', 'Resolver pendência de qualquer setor',
   'Corrigir e devolver uma pendência de nota de outro setor -- escolha quais setores alcançar, ou "todos".',
   false),
  ('gerenciar_usuarios', 'Gerenciar usuários e delegações',
   'Convidar, editar, desativar, excluir usuários e criar delegações -- hoje exclusivo de administrador. Depende de uma Edge Function à parte, ainda não adaptada.',
   false)
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------
-- Liga "Gerenciar cadastros": eh_operador_cadastro() é a função usada por
-- TODAS as policies de fornecedores/pagadores/centros_custo/classes_conta/
-- codigos_classificacao (ver 0007) -- um único ponto de mudança cascateia
-- pra tudo, sem precisar tocar em mais nenhuma policy.
-- ---------------------------------------------------------------------
create or replace function eh_operador_cadastro()
returns boolean
language sql stable
set search_path = public
as $$
  select eh_super_usuario() or 'contas_a_pagar' = ANY(papeis_efetivos()) or tem_permissao_extra('gerenciar_cadastros');
$$;

-- ---------------------------------------------------------------------
-- Liga "Aprovar/rejeitar caixinha": reaplica a policy inteira de
-- "caixinha_movimentacoes: update" (versão vigente, 0046), só acrescentando
-- o ramo novo -- e ajusta o trigger de bloqueio de mudança de status pra
-- reconhecer essa permissão extra também (senão a policy libera o UPDATE
-- mas o trigger barra a mudança de status igual).
--
-- Também precisa abrir a LEITURA de caixinhas/caixinha_movimentacoes
-- (0027_caixinha_por_setor.sql restringe departamento à própria caixinha)
-- -- do contrário quem ganha essa permissão nem enxerga a movimentação de
-- outro setor pra poder aprovar, só a atualização ficaria liberada sem
-- efeito nenhum. Mesmo nível de visibilidade que contas_a_pagar já tem
-- (todas as caixinhas).
-- ---------------------------------------------------------------------
drop policy if exists "caixinhas: leitura" on caixinhas;
create policy "caixinhas: leitura" on caixinhas for select
  using (
    eh_super_usuario()
    or 'contas_a_pagar' = ANY(papeis_efetivos())
    or tem_permissao_extra('aprovar_caixinha')
    or (
      'departamento' = ANY(papeis_efetivos())
      and setor = (select setor from usuario_atual())
    )
  );

drop policy if exists "caixinha_movimentacoes: leitura" on caixinha_movimentacoes;
create policy "caixinha_movimentacoes: leitura" on caixinha_movimentacoes for select
  using (
    eh_super_usuario()
    or 'contas_a_pagar' = ANY(papeis_efetivos())
    or tem_permissao_extra('aprovar_caixinha')
    or (
      'departamento' = ANY(papeis_efetivos())
      and exists (
        select 1 from caixinhas c
        where c.id = caixinha_movimentacoes.caixinha_id
        and c.setor = (select setor from usuario_atual())
      )
    )
  );

drop policy if exists "caixinha_movimentacoes: update" on caixinha_movimentacoes;
create policy "caixinha_movimentacoes: update" on caixinha_movimentacoes for update
  using (
    (eh_super_usuario() and status = 'pendente_aprovacao')
    or (tem_permissao_extra('aprovar_caixinha') and status = 'pendente_aprovacao')
    or (pode_agir_como(criado_por) and status in ('pendente_aprovacao', 'aprovado'))
  )
  with check (
    (eh_super_usuario() and status in ('aprovado', 'rejeitado'))
    or (tem_permissao_extra('aprovar_caixinha') and status in ('aprovado', 'rejeitado'))
    or (pode_agir_como(criado_por) and status in ('pendente_aprovacao', 'aprovado'))
  );

create or replace function bloquear_mudanca_status_caixinha_por_nao_super_usuario()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status and not eh_super_usuario() and not tem_permissao_extra('aprovar_caixinha') then
    raise exception 'Só quem tem autoridade de aprovação pode mudar o status da movimentação.';
  end if;
  return new;
end;
$$;
