-- Central CP — migration 0004: pagadores, centros de custo, classes, códigos, fornecedores
-- Parte da sequência em supabase/migrations/ — aplique em ordem numérica
-- num banco novo (ver README.md, seção "Como colocar para rodar").

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
