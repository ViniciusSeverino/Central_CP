-- Central CP — migration 0013: eh_administrador() + RPC de estatísticas de armazenamento
-- Parte da sequência em supabase/migrations/ — aplique em ordem numérica
-- num banco novo (ver README.md, seção "Como colocar para rodar").

create or replace function eh_administrador()
returns boolean
language sql stable
set search_path = public
as $$
  select 'administrador' = ANY(papeis_efetivos());
$$;

-- Dashboard de armazenamento (aba Cadastros → Armazenamento, só
-- administrador): tamanho do banco (dados) e do Storage (arquivos) — pra
-- acompanhar os limites do plano gratuito do Supabase (500MB banco / 1GB
-- storage — ver supabase.com/docs/guides/platform/billing-on-supabase se
-- o plano mudar). security definer porque pg_database_size() e o total
-- real de storage.objects (sem o recorte de RLS por nota visível) não são
-- expostos via RPC pro client por padrão — a checagem de administrador
-- dentro da função é quem garante que só ele vê isso.
create or replace function stats_armazenamento()
returns table (banco_bytes bigint, storage_bytes bigint, storage_arquivos integer)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not eh_administrador() then
    raise exception 'Só administrador pode ver as estatísticas de armazenamento.';
  end if;
  return query
  select
    pg_database_size(current_database()),
    coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint,
    count(*)::integer
  from storage.objects o
  where o.bucket_id = 'anexos-notas';
end;
$$;
