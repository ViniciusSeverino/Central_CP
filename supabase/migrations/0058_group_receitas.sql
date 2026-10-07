-- supabase/migrations/0058_group_receitas.sql
--
-- Receitas do Group (relatório "Pesquisa de Receitas - Por Conta" em CSV,
-- importado pelo administrador em Configurações › Orçamento -- ver
-- receitas.js). Entram no DRE (Receitas − Despesas = Resultado) e, depois,
-- no fluxo de caixa. Cada importação substitui a tabela inteira (o export
-- traz sempre tudo). Só o administrador lê e grava, como 0055/0056.
--
-- orcamento ganha receita_classe: o orçado de receitas é por classe do
-- Group (ALUGUEL MÍNIMO, ENCARGO COMUM...), que não existe no plano de
-- contas (que é só de despesas).
create table if not exists group_receitas (
  id_group bigint primary key,
  pagador_id uuid not null references pagadores(id) on delete cascade,
  classe text not null,
  classe_original text,
  tipo text,
  luc text,
  sacado text,
  mes_ref text,
  emissao date,
  vencimento date,
  venc_original date,
  recebimento date,
  liquidacao date,
  situacao text,
  faturado numeric(14, 2) not null default 0,
  desconto numeric(14, 2) not null default 0,
  juros numeric(14, 2) not null default 0,
  multa numeric(14, 2) not null default 0,
  correcoes numeric(14, 2) not null default 0,
  valor_liquido numeric(14, 2) not null default 0,
  conta text,
  num_acordo text,
  importado_em timestamptz not null default now()
);
alter table group_receitas enable row level security;
drop policy if exists "group_receitas: admin" on group_receitas;
create policy "group_receitas: admin" on group_receitas for all using (eh_administrador()) with check (eh_administrador());
create index if not exists group_receitas_pagador_emissao on group_receitas (pagador_id, emissao);
create index if not exists group_receitas_pagador_receb on group_receitas (pagador_id, recebimento);
create index if not exists group_receitas_pagador_venc on group_receitas (pagador_id, vencimento);

alter table orcamento add column if not exists receita_classe text;
alter table orcamento drop constraint if exists orcamento_uma_conta;
alter table orcamento add constraint orcamento_uma_conta check (
  (case when classe_conta_id is null then 0 else 1 end)
  + (case when codigo_classificacao_id is null then 0 else 1 end)
  + (case when receita_classe is null then 0 else 1 end) = 1);
-- Unicidade incluindo as receitas num índice novo. O orcamento_unico de
-- 0055 fica (ele ignora as linhas de receita, em que o coalesce dá null, e
-- continua valendo pras de despesa).
create unique index if not exists orcamento_unico_conta
  on orcamento (pagador_id, ano, mes, coalesce(codigo_classificacao_id::text, classe_conta_id::text, 'R:' || receita_classe));
