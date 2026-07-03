-- Detalhamento de impostos retidos por nota (documento WE9 -- "separar
-- valor bruto, líquido e quais impostos"). Mesmo padrão de linha-a-linha
-- já usado em nota_rateios: uma linha por imposto, soma controlada por
-- trigger, não por validação só no JS.
create type tipo_imposto as enum ('irrf', 'iss', 'pis_cofins_csll', 'inss', 'outro');

alter table notas add column tem_retencao_imposto boolean not null default false;
-- Sempre calculado (bruto - soma dos impostos), nunca digitado à mão --
-- ver triggers abaixo. Nasce igual ao bruto numa nota sem imposto.
alter table notas add column valor_liquido numeric(14,2);

create table nota_impostos (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references notas(id) on delete cascade,
  tipo tipo_imposto not null,
  valor numeric(14,2) not null check (valor >= 0),
  descricao text
);
create index idx_nota_impostos_nota on nota_impostos(nota_id);

alter table nota_impostos enable row level security;

-- Segue exatamente o mesmo critério de nota_rateios: dono da nota (direto
-- ou por delegação) ou super_usuario.
create policy "nota_impostos: select" on nota_impostos for select
  using (exists (select 1 from notas n where n.id = nota_id));
create policy "nota_impostos: insert" on nota_impostos for insert
  with check (exists (
    select 1 from notas n
    where n.id = nota_id
    and (pode_agir_como(n.criado_por) or eh_super_usuario())
  ));
create policy "nota_impostos: delete" on nota_impostos for delete
  using (exists (
    select 1 from notas n
    where n.id = nota_id
    and (pode_agir_como(n.criado_por) or eh_super_usuario())
  ));

-- Recalcula valor_liquido = valor_bruto - soma(nota_impostos.valor) de
-- uma nota específica -- chamado pelos triggers de nota_impostos (linha
-- muda) e de notas (valor_bruto muda). Nunca bloqueia (a soma dos
-- impostos excedendo o bruto fica como aviso no formulário, mesma
-- filosofia do resto do app) -- só espelha a conta de verdade.
create or replace function recalcular_valor_liquido_de(p_nota_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  vb numeric;
  soma numeric;
begin
  select valor_bruto into vb from notas where id = p_nota_id;
  if vb is null then
    return; -- nota não existe mais (delete em cascata já limpou os impostos dela)
  end if;
  select coalesce(sum(valor), 0) into soma from nota_impostos where nota_id = p_nota_id;
  update notas set valor_liquido = vb - soma where id = p_nota_id;
end;
$$;

create or replace function recalcular_valor_liquido_insert()
returns trigger language plpgsql set search_path = public as $$
declare r record;
begin
  for r in (select distinct nota_id from new_rows) loop
    perform recalcular_valor_liquido_de(r.nota_id);
  end loop;
  return null;
end;
$$;

create or replace function recalcular_valor_liquido_update()
returns trigger language plpgsql set search_path = public as $$
declare r record;
begin
  for r in (select nota_id from old_rows union select nota_id from new_rows) loop
    perform recalcular_valor_liquido_de(r.nota_id);
  end loop;
  return null;
end;
$$;

create or replace function recalcular_valor_liquido_delete()
returns trigger language plpgsql set search_path = public as $$
declare r record;
begin
  for r in (select distinct nota_id from old_rows) loop
    perform recalcular_valor_liquido_de(r.nota_id);
  end loop;
  return null;
end;
$$;

create trigger trg_recalcular_valor_liquido_insert
  after insert on nota_impostos
  referencing new table as new_rows
  for each statement
  execute function recalcular_valor_liquido_insert();

create trigger trg_recalcular_valor_liquido_update
  after update on nota_impostos
  referencing old table as old_rows new table as new_rows
  for each statement
  execute function recalcular_valor_liquido_update();

create trigger trg_recalcular_valor_liquido_delete
  after delete on nota_impostos
  referencing old table as old_rows
  for each statement
  execute function recalcular_valor_liquido_delete();

-- Nota nova (sem impostos ainda -- as linhas entram depois, já com o id
-- da nota criada) nasce com líquido = bruto. Editar o valor_bruto de uma
-- nota existente recalcula o líquido mantendo a mesma lista de impostos.
create or replace function recalcular_valor_liquido_da_propria_nota()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.valor_liquido := new.valor_bruto;
  elsif new.valor_bruto is distinct from old.valor_bruto then
    new.valor_liquido := new.valor_bruto - coalesce((select sum(valor) from nota_impostos where nota_id = new.id), 0);
  end if;
  return new;
end;
$$;

create trigger trg_recalcular_valor_liquido_da_nota
  before insert or update on notas
  for each row
  execute function recalcular_valor_liquido_da_propria_nota();
