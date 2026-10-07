-- supabase/migrations/0060_fluxo_saldo.sql
--
-- Fluxo de caixa (Visão geral › Fluxo de caixa, ver fluxo_caixa.js): o
-- saldo em conta de cada pagador no início de um mês, informado pelo
-- administrador -- dali em diante o saldo é encadeado com as entradas
-- (receitas do Group) e saídas (despesas do Group + notas do Central CP
-- ainda não lançadas). Um por pagador. Só o administrador lê e grava.
create table if not exists fluxo_saldo_inicial (
  pagador_id uuid primary key references pagadores(id) on delete cascade,
  data date not null,
  valor numeric(14, 2) not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);
alter table fluxo_saldo_inicial enable row level security;
drop policy if exists "fluxo_saldo_inicial: admin" on fluxo_saldo_inicial;
create policy "fluxo_saldo_inicial: admin" on fluxo_saldo_inicial for all using ((select eh_administrador())) with check ((select eh_administrador()));
