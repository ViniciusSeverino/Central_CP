-- Central CP — migration 0021: alerta automático de uso do plano gratuito
-- Parte da sequência em supabase/migrations/ — aplique em ordem numérica
-- num banco novo (ver README.md, seção "Como colocar para rodar").
--
-- pg_cron chama a Edge Function "alerta-armazenamento" periodicamente (a
-- cada 6 horas) -- ela confere o uso do banco/Storage contra os limites
-- do plano gratuito do Supabase (500 MB banco / 1 GB Storage) e manda
-- e-mail pra administrador/gerente_financeiro quando cruza 70/85/95% do
-- limite, sem repetir o mesmo patamar dentro de 7 dias (senão vira spam
-- enquanto o uso fica parado no mesmo nível).
create extension if not exists pg_cron;

-- Mesma consulta de stats_armazenamento() (migration 0013), mas aceita
-- tanto administrador (uso futuro num dashboard) quanto o service_role
-- (chamada pela Edge Function, que não tem auth.uid() nenhum associado
-- -- eh_administrador() sozinho sempre devolveria falso pra ela).
--
-- IMPORTANTE: revoke/grant sozinho NÃO bloqueia anon/authenticated neste
-- projeto Supabase -- ele concede EXECUTE a esses papéis por default
-- privileges no schema public, independente do "revoke ... from public"
-- (confirmado via teste direto com a anon key). Por isso a checagem de
-- permissão precisa ficar DENTRO da função, no mesmo padrão já usado por
-- arquivar_anexos_lote/stats_armazenamento (eh_administrador()/
-- eh_operador_cadastro() como guarda interna, não como grant).
create or replace function stats_armazenamento_service()
returns table (banco_bytes bigint, storage_bytes bigint, storage_arquivos integer)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not (eh_administrador() or auth.role() = 'service_role') then
    raise exception 'Sem permissão para ver estatísticas de armazenamento.';
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

revoke all on function stats_armazenamento_service() from public;
grant execute on function stats_armazenamento_service() to service_role, authenticated;

-- Guarda quando cada patamar (70/85/95%) já foi avisado, pra não repetir
-- o e-mail toda vez que o cron rodar enquanto o uso ficar no mesmo nível.
create table alerta_armazenamento_historico (
  id uuid primary key default gen_random_uuid(),
  patamar integer not null,
  enviado_em timestamptz not null default now()
);
alter table alerta_armazenamento_historico enable row level security;
create policy "alerta_armazenamento_historico: select" on alerta_armazenamento_historico for select
  using (auth.role() = 'authenticated');
-- Sem policy de insert pra authenticated/anon de propósito -- só a Edge
-- Function grava aqui, via service_role (que ignora RLS).

-- URL/anon key iguais às já usadas no webhook de movimentação (migration
-- 0010) -- mesma lógica: a anon key é pública por design, e pg_net não é
-- relocatable, então fica em `public` também de propósito, não descuido.
select cron.schedule(
  'checar-armazenamento',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := 'https://ofzqboxmlfogstpjaxdq.supabase.co/functions/v1/alerta-armazenamento',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9menFib3htbGZvZ3N0cGpheGRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNjY4MTUsImV4cCI6MjA5Nzc0MjgxNX0.li2PLlz0eE68WhenrX4DE5WhZR4tw814VOgHRD2PF2w'
    ),
    body := '{}'::jsonb
  );
  $$
);
