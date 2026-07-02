-- Central CP — schema completo do Supabase (Postgres)
-- Gerado a partir do projeto real (ofzqboxmlfogstpjaxdq) em 2026-07-02.
-- Este arquivo é a fonte de verdade documental do schema; para reaplicar em um
-- projeto novo, rode este script inteiro no SQL Editor do Supabase (ou via
-- `supabase db push` / migration equivalente).

-- ============================================================
-- Extensões
-- ============================================================
create extension if not exists pg_trgm;

-- ============================================================
-- Enums
-- ============================================================
create type public.user_role as enum ('departamento', 'gestor', 'contas_a_pagar');
create type public.setor_tipo as enum ('Marketing', 'Operações', 'Financeiro');
create type public.classificacao_tipo as enum ('Compras', 'Serviço', 'Outros');
create type public.forma_pagamento_tipo as enum ('Boleto bancário', 'TED', 'Pix');
create type public.nota_status as enum ('rascunho', 'lancado', 'aprovado', 'em_pagamento', 'pago');

-- ============================================================
-- Tabelas
-- ============================================================

create table public.usuarios (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id),
  nome text not null,
  role public.user_role not null,
  setor public.setor_tipo,
  criado_em timestamptz not null default now()
);

create table public.pagadores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  sigla text unique
);

create table public.centros_custo (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  nome text not null,
  sigla text unique,
  origem_siglas text[] not null default '{}'
);

create table public.classes_conta (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  nome text not null,
  centro_custo_id uuid references public.centros_custo(id)
);

create table public.codigos_classificacao (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  nome text not null,
  classe_conta_id uuid references public.classes_conta(id)
);

create table public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  municipio text,
  cod_group text,
  criado_em timestamptz not null default now()
);

create table public.fornecedor_contas (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid references public.fornecedores(id),
  cod_banco text,
  agencia text,
  conta text
);

create table public.notas (
  id uuid primary key default gen_random_uuid(),
  data_emissao date,
  vencimento date,
  numero_nota text,
  valor_bruto numeric not null default 0,
  descricao text,
  anexos text[] default '{}',
  pagador_id uuid references public.pagadores(id),
  fornecedor_id uuid references public.fornecedores(id),
  forma_pagamento public.forma_pagamento_tipo,
  conta_bancaria_id uuid references public.fornecedor_contas(id),
  classificacao public.classificacao_tipo,
  tem_rateio boolean not null default false,
  centro_custo_id uuid references public.centros_custo(id),
  classe_conta_id uuid references public.classes_conta(id),
  codigo_classificacao_id uuid references public.codigos_classificacao(id),
  status public.nota_status not null default 'rascunho',
  pendente boolean not null default false,
  motivo_pendencia text,
  setor public.setor_tipo,
  aprovado_por uuid references public.usuarios(id),
  data_aprovacao timestamptz,
  comentario_aprovacao text,
  numero_chamado text,
  data_chamado timestamptz,
  data_pagamento date,
  criado_por uuid not null references public.usuarios(id),
  criado_em timestamptz not null default now()
);

create table public.nota_rateios (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references public.notas(id),
  valor numeric not null,
  centro_custo_id uuid not null references public.centros_custo(id),
  classe_conta_id uuid not null references public.classes_conta(id),
  codigo_classificacao_id uuid references public.codigos_classificacao(id),
  descricao text
);

create table public.nota_historico (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references public.notas(id),
  usuario_id uuid references public.usuarios(id),
  acao text not null,
  detalhe text,
  criado_em timestamptz not null default now()
);

-- ============================================================
-- Índices
-- ============================================================
create index idx_classes_centro on public.classes_conta (centro_custo_id);
create index idx_codigos_classe on public.codigos_classificacao (classe_conta_id);
create index idx_fornecedor_contas_fornecedor on public.fornecedor_contas (fornecedor_id);
create index idx_fornecedores_nome on public.fornecedores using gin (nome gin_trgm_ops);
create index idx_notas_criado_por on public.notas (criado_por);
create index idx_notas_pendente on public.notas (pendente);
create index idx_notas_setor on public.notas (setor);
create index idx_notas_status on public.notas (status);

-- ============================================================
-- Função auxiliar: linha de usuarios do usuário autenticado atual
-- ============================================================
create or replace function public.usuario_atual()
returns public.usuarios
language sql
stable security definer
set search_path = public
as $$
  select * from public.usuarios where auth_user_id = auth.uid();
$$;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.usuarios enable row level security;
alter table public.pagadores enable row level security;
alter table public.centros_custo enable row level security;
alter table public.classes_conta enable row level security;
alter table public.codigos_classificacao enable row level security;
alter table public.fornecedores enable row level security;
alter table public.fornecedor_contas enable row level security;
alter table public.notas enable row level security;
alter table public.nota_rateios enable row level security;
alter table public.nota_historico enable row level security;

-- usuarios: qualquer autenticado lê todos os perfis (para exibir nomes),
-- mas só insere/atualiza o próprio registro.
create policy "usuarios: leitura geral" on public.usuarios
  for select using (auth.role() = 'authenticated');
create policy "usuarios: insere o próprio" on public.usuarios
  for insert with check (auth_user_id = auth.uid());
create policy "usuarios: atualiza o próprio" on public.usuarios
  for update using (auth_user_id = auth.uid());

-- Cadastros de referência: qualquer autenticado lê e escreve (protótipo —
-- em produção real, restringir escrita por papel).
create policy "pagadores: leitura" on public.pagadores for select using (auth.role() = 'authenticated');
create policy "pagadores: escrita" on public.pagadores for all using (auth.role() = 'authenticated');

create policy "centros_custo: leitura" on public.centros_custo for select using (auth.role() = 'authenticated');
create policy "centros_custo: escrita" on public.centros_custo for all using (auth.role() = 'authenticated');

create policy "classes_conta: leitura" on public.classes_conta for select using (auth.role() = 'authenticated');
create policy "classes_conta: escrita" on public.classes_conta for all using (auth.role() = 'authenticated');

create policy "codigos_classificacao: leitura" on public.codigos_classificacao for select using (auth.role() = 'authenticated');
create policy "codigos_classificacao: escrita" on public.codigos_classificacao for all using (auth.role() = 'authenticated');

create policy "fornecedores: leitura" on public.fornecedores for select using (auth.role() = 'authenticated');
create policy "fornecedores: escrita" on public.fornecedores for all using (auth.role() = 'authenticated');

create policy "fornecedor_contas: leitura" on public.fornecedor_contas for select using (auth.role() = 'authenticated');
create policy "fornecedor_contas: escrita" on public.fornecedor_contas for all using (auth.role() = 'authenticated');

-- notas: visibilidade e escrita variam por papel e setor.
create policy "notas: select" on public.notas
  for select using (
    case (select role from usuario_atual())
      when 'departamento' then criado_por = (select id from usuario_atual())
      when 'gestor' then setor = (select setor from usuario_atual()) and status <> 'rascunho'::nota_status
      when 'contas_a_pagar' then status <> 'rascunho'::nota_status
      else false
    end
  );

create policy "notas: insert" on public.notas
  for insert with check (
    (select role from usuario_atual()) = 'departamento'::user_role
    and criado_por = (select id from usuario_atual())
    and setor = (select setor from usuario_atual())
  );

-- Sem WITH CHECK explícito aqui, o Postgres reaplica o USING como WITH CHECK
-- contra a linha NOVA — o que bloquearia toda transição de status (o gestor
-- não conseguiria aprovar, o contas a pagar não conseguiria pagar). Por isso
-- o WITH CHECK abaixo é mais permissivo que o USING, liberando os status de
-- destino válidos para cada papel.
create policy "notas: update" on public.notas
  for update
  using (
    case (select role from usuario_atual())
      when 'departamento' then criado_por = (select id from usuario_atual())
        and status = any (array['rascunho','lancado']::nota_status[])
      when 'gestor' then setor = (select setor from usuario_atual())
        and status = 'lancado'::nota_status
      when 'contas_a_pagar' then status = any (array['aprovado','em_pagamento']::nota_status[])
      else false
    end
  )
  with check (
    case (select role from usuario_atual())
      when 'departamento' then criado_por = (select id from usuario_atual())
        and status = any (array['rascunho','lancado']::nota_status[])
      when 'gestor' then setor = (select setor from usuario_atual())
        and status = any (array['lancado','aprovado']::nota_status[])
      when 'contas_a_pagar' then status = any (array['aprovado','em_pagamento','pago']::nota_status[])
      else false
    end
  );

create policy "nota_rateios: select" on public.nota_rateios
  for select using (exists (select 1 from public.notas n where n.id = nota_rateios.nota_id));

create policy "nota_rateios: insert" on public.nota_rateios
  for insert with check (
    exists (
      select 1 from public.notas n
      where n.id = nota_rateios.nota_id
        and (
          n.criado_por = (select id from usuario_atual())
          or (select role from usuario_atual()) = any (array['gestor','contas_a_pagar']::user_role[])
        )
    )
  );

create policy "nota_rateios: delete" on public.nota_rateios
  for delete using (
    exists (
      select 1 from public.notas n
      where n.id = nota_rateios.nota_id
        and n.criado_por = (select id from usuario_atual())
    )
  );

create policy "nota_historico: select" on public.nota_historico
  for select using (auth.role() = 'authenticated');
create policy "nota_historico: insert" on public.nota_historico
  for insert with check (auth.role() = 'authenticated');
