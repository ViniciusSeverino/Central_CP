-- supabase/migrations/0055_orcamento.sql
--
-- Orçamento anual por conta, pro DRE da Visão geral (orçado x realizado,
-- ver dre.js/ui_dre.js). Uma linha por pagador × ano × mês × conta. A
-- conta pode ser um CÓDIGO da classificação (o nível mais fino) ou uma
-- CLASSE inteira -- cada empresa orça num nível, e a importação aceita os
-- dois (ver orcamento.js). Exatamente um dos dois é preenchido.
--
-- Por enquanto SÓ o administrador lê e grava (pedido do dono do produto:
-- ele valida os números com os controles externos antes de liberar o DRE
-- pros demais -- ver podeVerDre em state.js). Liberar a leitura depois é
-- trocar a policy de select.
create table if not exists orcamento (
  id uuid primary key default gen_random_uuid(),
  pagador_id uuid not null references pagadores(id) on delete cascade,
  ano int not null check (ano between 2000 and 2100),
  mes int not null check (mes between 1 and 12),
  classe_conta_id uuid references classes_conta(id) on delete cascade,
  codigo_classificacao_id uuid references codigos_classificacao(id) on delete cascade,
  valor numeric(14, 2) not null default 0,
  atualizado_por uuid references usuarios(id),
  atualizado_em timestamptz not null default now(),
  constraint orcamento_uma_conta check ((classe_conta_id is null) <> (codigo_classificacao_id is null))
);
create unique index if not exists orcamento_unico
  on orcamento (pagador_id, ano, mes, coalesce(codigo_classificacao_id, classe_conta_id));
create index if not exists orcamento_pagador_ano on orcamento (pagador_id, ano);

alter table orcamento enable row level security;
drop policy if exists "orcamento: select" on orcamento;
create policy "orcamento: select" on orcamento for select using (eh_administrador());
drop policy if exists "orcamento: escrita" on orcamento;
create policy "orcamento: escrita" on orcamento for all using (eh_administrador()) with check (eh_administrador());
