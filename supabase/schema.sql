-- =====================================================================
-- Central CP — esquema de banco de dados (Supabase / Postgres)
-- =====================================================================
-- Como usar:
--   1. Crie um projeto em https://supabase.com
--   2. Abra SQL Editor → New query → cole este arquivo inteiro → Run
--   3. Confirme em Database → Tables que todas as tabelas foram criadas
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- TIPOS (enums)
-- ---------------------------------------------------------------------
create type user_role as enum ('departamento', 'gestor', 'contas_a_pagar');
create type setor_tipo as enum ('Marketing', 'Operações', 'Financeiro');
create type nota_status as enum (
  'rascunho', 'lancado', 'aprovado',
  'lancado_no_group', 'chamado_aberto', 'validado_csc',
  'pago'
);
create type forma_pagamento_tipo as enum ('Boleto bancário', 'TED', 'Pix');
create type classificacao_tipo as enum ('Compras', 'Serviço', 'Outros');

-- ---------------------------------------------------------------------
-- USUÁRIOS — perfil de aplicação ligado ao Supabase Auth (auth.users)
-- ---------------------------------------------------------------------
create table usuarios (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  nome text not null,
  role user_role not null,
  setor setor_tipo, -- obrigatório para 'departamento' e 'gestor'; nulo para 'contas_a_pagar'
  criado_em timestamptz not null default now(),
  constraint setor_obrigatorio_exceto_cap check (
    (role = 'contas_a_pagar') or (setor is not null)
  )
);

-- Função auxiliar: retorna a linha de `usuarios` do usuário autenticado atual.
-- Usada dentro das policies para checar role/setor sem repetir o join.
create or replace function usuario_atual()
returns usuarios
language sql security definer stable
set search_path = public
as $$
  select * from usuarios where auth_user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- CADASTROS
-- ---------------------------------------------------------------------
create table pagadores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  sigla text not null unique
);

create table centros_custo (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  nome text not null,
  sigla text not null unique,
  origem_siglas text[] not null default '{}'
);

create table classes_conta (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  nome text not null,
  centro_custo_id uuid not null references centros_custo(id) on delete cascade
);

create table codigos_classificacao (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  nome text not null,
  classe_conta_id uuid not null references classes_conta(id) on delete cascade
);

create table fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  municipio text,
  cod_group text,
  criado_em timestamptz not null default now()
);

create table fornecedor_contas (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references fornecedores(id) on delete cascade,
  cod_banco text,
  agencia text,
  conta text
);

-- ---------------------------------------------------------------------
-- NOTAS
-- ---------------------------------------------------------------------
create table notas (
  id uuid primary key default gen_random_uuid(),
  data_emissao date,
  vencimento date,
  numero_nota text,
  valor_bruto numeric(14,2) not null default 0,
  descricao text,
  anexos text[] default '{}',

  pagador_id uuid references pagadores(id),
  fornecedor_id uuid references fornecedores(id),
  forma_pagamento forma_pagamento_tipo,
  conta_bancaria_id uuid references fornecedor_contas(id),
  classificacao classificacao_tipo,

  tem_rateio boolean not null default false,
  centro_custo_id uuid references centros_custo(id),
  classe_conta_id uuid references classes_conta(id),
  codigo_classificacao_id uuid references codigos_classificacao(id),

  status nota_status not null default 'rascunho',
  pendente boolean not null default false,
  motivo_pendencia text,
  setor setor_tipo,

  aprovado_por uuid references usuarios(id),
  data_aprovacao timestamptz,
  comentario_aprovacao text,

  -- Etapa 1 do pós-aprovação: lançamento no ERP "Group".
  numero_lancamento_group text,
  data_lancamento_group timestamptz,

  -- Etapa 2: chamado aberto no Acelerato (CSC).
  numero_chamado text,
  data_chamado timestamptz,

  -- Etapa 3: CSC validou o chamado (antes de confirmar o pagamento).
  data_validacao_csc timestamptz,
  validado_por uuid references usuarios(id),

  data_pagamento date,

  criado_por uuid not null references usuarios(id),
  criado_em timestamptz not null default now()
);

create table nota_rateios (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references notas(id) on delete cascade,
  valor numeric(14,2) not null,
  centro_custo_id uuid not null references centros_custo(id),
  classe_conta_id uuid not null references classes_conta(id),
  codigo_classificacao_id uuid references codigos_classificacao(id),
  descricao text
);

create table nota_historico (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references notas(id) on delete cascade,
  usuario_id uuid references usuarios(id),
  acao text not null,
  detalhe text,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ÍNDICES
-- ---------------------------------------------------------------------
create index idx_notas_status on notas(status);
create index idx_notas_setor on notas(setor);
create index idx_notas_criado_por on notas(criado_por);
create index idx_notas_pendente on notas(pendente);
create index idx_classes_centro on classes_conta(centro_custo_id);
create index idx_codigos_classe on codigos_classificacao(classe_conta_id);
create index idx_fornecedor_contas_fornecedor on fornecedor_contas(fornecedor_id);
create index idx_fornecedores_nome on fornecedores using gin (nome gin_trgm_ops);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table usuarios enable row level security;
alter table pagadores enable row level security;
alter table centros_custo enable row level security;
alter table classes_conta enable row level security;
alter table codigos_classificacao enable row level security;
alter table fornecedores enable row level security;
alter table fornecedor_contas enable row level security;
alter table notas enable row level security;
alter table nota_rateios enable row level security;
alter table nota_historico enable row level security;

-- ---------------------------------------------------------------------
-- USUARIOS: qualquer autenticado lê todo mundo (precisa pra mostrar nome
-- de quem criou/aprovou); só edita o próprio perfil; insere o próprio
-- perfil uma vez (no cadastro).
-- ---------------------------------------------------------------------
create policy "usuarios: leitura geral" on usuarios for select
  using (auth.role() = 'authenticated');
create policy "usuarios: insere o próprio" on usuarios for insert
  with check (auth_user_id = auth.uid());
create policy "usuarios: atualiza o próprio" on usuarios for update
  using (auth_user_id = auth.uid());

-- ---------------------------------------------------------------------
-- CADASTROS (pagadores, centros_custo, classes_conta, codigos_classificacao,
-- fornecedores, fornecedor_contas): leitura geral para autenticados (o
-- departamento precisa ler pra montar a nota); escrita (insert/update/
-- delete) só para contas_a_pagar.
-- ---------------------------------------------------------------------
create policy "pagadores: leitura" on pagadores for select using (auth.role() = 'authenticated');
create policy "pagadores: escrita" on pagadores for all
  using ((select role from usuario_atual()) = 'contas_a_pagar')
  with check ((select role from usuario_atual()) = 'contas_a_pagar');

create policy "centros_custo: leitura" on centros_custo for select using (auth.role() = 'authenticated');
create policy "centros_custo: escrita" on centros_custo for all
  using ((select role from usuario_atual()) = 'contas_a_pagar')
  with check ((select role from usuario_atual()) = 'contas_a_pagar');

create policy "classes_conta: leitura" on classes_conta for select using (auth.role() = 'authenticated');
create policy "classes_conta: escrita" on classes_conta for all
  using ((select role from usuario_atual()) = 'contas_a_pagar')
  with check ((select role from usuario_atual()) = 'contas_a_pagar');

create policy "codigos_classificacao: leitura" on codigos_classificacao for select using (auth.role() = 'authenticated');
create policy "codigos_classificacao: escrita" on codigos_classificacao for all
  using ((select role from usuario_atual()) = 'contas_a_pagar')
  with check ((select role from usuario_atual()) = 'contas_a_pagar');

create policy "fornecedores: leitura" on fornecedores for select using (auth.role() = 'authenticated');
create policy "fornecedores: escrita" on fornecedores for all
  using ((select role from usuario_atual()) = 'contas_a_pagar')
  with check ((select role from usuario_atual()) = 'contas_a_pagar');

create policy "fornecedor_contas: leitura" on fornecedor_contas for select using (auth.role() = 'authenticated');
create policy "fornecedor_contas: escrita" on fornecedor_contas for all
  using ((select role from usuario_atual()) = 'contas_a_pagar')
  with check ((select role from usuario_atual()) = 'contas_a_pagar');

-- ---------------------------------------------------------------------
-- NOTAS — aqui sim a regra de negócio importa de verdade.
-- ---------------------------------------------------------------------

-- SELECT:
--   departamento → só as próprias (qualquer status, inclusive rascunho)
--   gestor       → as do próprio setor, exceto rascunhos de outras pessoas
--   contas_a_pagar → todas, exceto rascunhos
create policy "notas: select" on notas for select
  using (
    case (select role from usuario_atual())
      when 'departamento' then criado_por = (select id from usuario_atual())
      when 'gestor' then setor = (select setor from usuario_atual()) and status <> 'rascunho'
      when 'contas_a_pagar' then status <> 'rascunho'
      else false
    end
  );

-- INSERT: só departamento, e só pode criar em seu próprio nome/setor
create policy "notas: insert" on notas for insert
  with check (
    (select role from usuario_atual()) = 'departamento'
    and criado_por = (select id from usuario_atual())
    and setor = (select setor from usuario_atual())
  );

-- UPDATE:
--   departamento (dono) → enquanto rascunho/lancado (fluxo normal de envio),
--     OU, em qualquer etapa pós-aprovação, enquanto pendente=true — é assim
--     que o departamento corrige os dados e devolve a nota depois que o
--     contas_a_pagar marca uma pendência (o CP não resolve mais sozinho,
--     só marca; quem tem os documentos originais pra corrigir é quem
--     lançou a nota).
--   gestor → enquanto lancado e do seu setor (aprovar/reprovar)
--   contas_a_pagar → aprovado -> lancado_no_group -> chamado_aberto ->
--     validado_csc -> pago, uma etapa de cada vez, podendo marcar
--     pendente=true em qualquer uma dessas 4 etapas (mas não resolver).
--
-- IMPORTANTE: sem um WITH CHECK explícito, o Postgres reaplica o USING acima
-- contra a linha NOVA (pós-update) — o que bloquearia toda transição de
-- status real. O WITH CHECK abaixo é deliberadamente mais permissivo que o
-- USING, liberando os status de destino válidos para cada papel. A única
-- garantia forte que continua no banco: o departamento nunca consegue
-- levar uma nota até 'pago' sozinho, mesmo "resolvendo" uma pendência —
-- esse status fica de fora do WITH CHECK dele.
create policy "notas: update" on notas for update
  using (
    case (select role from usuario_atual())
      when 'departamento' then
        criado_por = (select id from usuario_atual())
        and (
          status in ('rascunho','lancado')
          or pendente = true
        )
      when 'gestor' then
        setor = (select setor from usuario_atual()) and status = 'lancado'
      when 'contas_a_pagar' then
        status in ('aprovado','lancado_no_group','chamado_aberto','validado_csc')
      else false
    end
  )
  with check (
    case (select role from usuario_atual())
      when 'departamento' then
        criado_por = (select id from usuario_atual())
        and status in ('rascunho','lancado','aprovado','lancado_no_group','chamado_aberto','validado_csc')
      when 'gestor' then
        setor = (select setor from usuario_atual()) and status in ('lancado','aprovado')
      when 'contas_a_pagar' then
        status in ('aprovado','lancado_no_group','chamado_aberto','validado_csc','pago')
      else false
    end
  );

-- ---------------------------------------------------------------------
-- NOTA_RATEIOS — segue a mesma visibilidade da nota pai
-- ---------------------------------------------------------------------
create policy "nota_rateios: select" on nota_rateios for select
  using (exists (select 1 from notas n where n.id = nota_id));
create policy "nota_rateios: insert" on nota_rateios for insert
  with check (exists (
    select 1 from notas n
    where n.id = nota_id
    and (
      n.criado_por = (select id from usuario_atual())
      or (select role from usuario_atual()) in ('gestor','contas_a_pagar')
    )
  ));
create policy "nota_rateios: delete" on nota_rateios for delete
  using (exists (
    select 1 from notas n
    where n.id = nota_id
    and n.criado_por = (select id from usuario_atual())
  ));

-- ---------------------------------------------------------------------
-- NOTA_HISTORICO — qualquer autenticado que pode ver a nota pode ver o
-- histórico; inserir é liberado pra qualquer autenticado (a aplicação é
-- quem decide quando registrar uma entrada, não o banco).
-- ---------------------------------------------------------------------
create policy "nota_historico: select" on nota_historico for select
  using (auth.role() = 'authenticated');
create policy "nota_historico: insert" on nota_historico for insert
  with check (auth.role() = 'authenticated');
