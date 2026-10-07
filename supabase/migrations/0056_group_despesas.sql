-- supabase/migrations/0056_group_despesas.sql
--
-- Despesas do Group (relatório "Pesquisa de Despesas" em CSV, importado
-- pelo administrador em Configurações › Orçamento -- ver
-- group_importacao.js). É o REALIZADO oficial do DRE (decisão do dono do
-- produto); o Central CP vira a coluna de conferência e a conciliação
-- casa os dois pelo nº do movimento (Movimento do Group =
-- notas.numero_lancamento_group).
--
-- group_lancamentos: uma linha por linha do relatório. Cada importação
--   substitui a tabela inteira (o export do Group é sempre "tudo").
-- group_mapeamento: de-para manual (pagador + centro + classe do Group ->
--   conta do Central CP) pro que não casa sozinho pelo nome.
--
-- Só o administrador lê e grava, como o orçamento (0055) e o DRE.
create table if not exists group_lancamentos (
  id_group bigint primary key,
  movimento text,
  pagador_id uuid not null references pagadores(id) on delete cascade,
  mes_ref text,
  vencimento date,
  pagamento date,
  situacao text,
  cod_cc text,
  centro_nome text,
  cod_classe text,
  classe_nome text,
  classe_base text,
  eh_retencao boolean not null default false,
  fornecedor text,
  nota_fiscal text,
  valor numeric(14, 2) not null default 0,
  valor_pago numeric(14, 2) not null default 0,
  importado_em timestamptz not null default now()
);
create index if not exists group_lancamentos_movimento on group_lancamentos (movimento);
create index if not exists group_lancamentos_pagador_venc on group_lancamentos (pagador_id, vencimento);

create table if not exists group_mapeamento (
  id uuid primary key default gen_random_uuid(),
  pagador_id uuid not null references pagadores(id) on delete cascade,
  centro_nome text not null,
  classe_base text not null,
  classe_conta_id uuid references classes_conta(id) on delete cascade,
  codigo_classificacao_id uuid references codigos_classificacao(id) on delete cascade,
  atualizado_em timestamptz not null default now(),
  constraint group_mapeamento_uma_conta check ((classe_conta_id is null) <> (codigo_classificacao_id is null))
);
create unique index if not exists group_mapeamento_par on group_mapeamento (pagador_id, lower(centro_nome), lower(classe_base));

alter table group_lancamentos enable row level security;
alter table group_mapeamento enable row level security;
drop policy if exists "group_lancamentos: admin" on group_lancamentos;
create policy "group_lancamentos: admin" on group_lancamentos for all using (eh_administrador()) with check (eh_administrador());
drop policy if exists "group_mapeamento: admin" on group_mapeamento;
create policy "group_mapeamento: admin" on group_mapeamento for all using (eh_administrador()) with check (eh_administrador());
