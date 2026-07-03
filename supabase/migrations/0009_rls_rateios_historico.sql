-- Central CP — migration 0009: policies de rateio/histórico + triggers de validação de soma
-- Parte da sequência em supabase/migrations/ — aplique em ordem numérica
-- num banco novo (ver README.md, seção "Como colocar para rodar").

-- ---------------------------------------------------------------------
-- NOTA_RATEIOS — segue o dono da nota (direto ou por delegação) ou super.
-- ---------------------------------------------------------------------
create policy "nota_rateios: select" on nota_rateios for select
  using (exists (select 1 from notas n where n.id = nota_id));
create policy "nota_rateios: insert" on nota_rateios for insert
  with check (exists (
    select 1 from notas n
    where n.id = nota_id
    and (pode_agir_como(n.criado_por) or eh_super_usuario())
  ));
create policy "nota_rateios: delete" on nota_rateios for delete
  using (exists (
    select 1 from notas n
    where n.id = nota_id
    and (pode_agir_como(n.criado_por) or eh_super_usuario())
  ));

-- "Soma do rateio = valor bruto da nota" hoje só é checada no JS do
-- formulário. Este trigger garante a mesma regra no banco, como última
-- linha de defesa contra uma chamada direta à API ou um bug futuro na
-- tela. soma = 0 é tratado como "ainda não classificado" (não erro),
-- porque o fluxo de edição do app apaga os rateios antigos e insere os
-- novos em duas chamadas separadas (delete, depois insert) — sem essa
-- folga, a própria edição de nota quebraria no meio da troca. Precisa de
-- 3 funções (uma por evento) porque transition tables (old/new) não podem
-- ser usadas num único trigger que cubra insert+update+delete de uma vez.
create or replace function validar_soma_rateio_de(p_nota_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  soma numeric;
  vb numeric;
  tem_rat boolean;
begin
  select valor_bruto, tem_rateio into vb, tem_rat from notas where id = p_nota_id;
  if tem_rat then
    select coalesce(sum(valor), 0) into soma from nota_rateios where nota_id = p_nota_id;
    if soma > 0 and abs(soma - vb) > 0.01 then
      raise exception 'A soma do rateio (%) precisa ser igual ao valor bruto da nota (%).', soma, vb;
    end if;
  end if;
end;
$$;

create or replace function validar_soma_rateio_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare r record;
begin
  for r in (select distinct nota_id from new_rows) loop
    perform validar_soma_rateio_de(r.nota_id);
  end loop;
  return null;
end;
$$;

create or replace function validar_soma_rateio_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare r record;
begin
  for r in (select nota_id from old_rows union select nota_id from new_rows) loop
    perform validar_soma_rateio_de(r.nota_id);
  end loop;
  return null;
end;
$$;

create or replace function validar_soma_rateio_delete()
returns trigger
language plpgsql
set search_path = public
as $$
declare r record;
begin
  for r in (select distinct nota_id from old_rows) loop
    perform validar_soma_rateio_de(r.nota_id);
  end loop;
  return null;
end;
$$;

create trigger trg_validar_soma_rateio_insert
  after insert on nota_rateios
  referencing new table as new_rows
  for each statement
  execute function validar_soma_rateio_insert();

create trigger trg_validar_soma_rateio_update
  after update on nota_rateios
  referencing old table as old_rows new table as new_rows
  for each statement
  execute function validar_soma_rateio_update();

create trigger trg_validar_soma_rateio_delete
  after delete on nota_rateios
  referencing old table as old_rows
  for each statement
  execute function validar_soma_rateio_delete();

-- ---------------------------------------------------------------------
-- NOTA_HISTORICO — qualquer autenticado que pode ver a nota pode ver o
-- histórico. Inserir exige duas coisas: usuario_id tem que ser o próprio
-- chamador (sem isso, dava pra forjar uma entrada em nome de outra pessoa)
-- e a nota referenciada precisa existir E ser visível pra ele — o exists
-- herda automaticamente a policy "notas: select" (é uma query normal
-- contra uma tabela com RLS, não security definer).
-- ---------------------------------------------------------------------
create policy "nota_historico: select" on nota_historico for select
  using (auth.role() = 'authenticated');
create policy "nota_historico: insert" on nota_historico for insert
  with check (
    usuario_id = (select id from usuario_atual())
    and exists (select 1 from notas n where n.id = nota_id)
  );
