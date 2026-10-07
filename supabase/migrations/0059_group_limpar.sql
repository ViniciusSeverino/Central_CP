-- supabase/migrations/0059_group_limpar.sql
--
-- Reimportar os relatórios do Group (0056/0058) apagava a importação
-- anterior com um DELETE pela API -- e a policy RLS (eh_administrador())
-- rodava em cada uma das ~28 mil linhas de receita, estourando os 8s de
-- statement_timeout do papel authenticated. Agora:
-- 1. limpar_relatorio_group(tipo): checa o administrador UMA vez e faz
--    TRUNCATE (instantâneo);
-- 2. as policies passam a usar (select eh_administrador()), que o Postgres
--    avalia uma vez por consulta, não por linha.
create or replace function public.limpar_relatorio_group(p_tipo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not eh_administrador() then
    raise exception 'Só o administrador pode reimportar os relatórios do Group.';
  end if;
  if p_tipo = 'receitas' then
    truncate table group_receitas;
  elsif p_tipo = 'despesas' then
    truncate table group_lancamentos;
  else
    raise exception 'Tipo de relatório desconhecido: %', p_tipo;
  end if;
end;
$$;
revoke all on function public.limpar_relatorio_group(text) from public, anon;
grant execute on function public.limpar_relatorio_group(text) to authenticated;

drop policy if exists "group_lancamentos: admin" on group_lancamentos;
create policy "group_lancamentos: admin" on group_lancamentos for all using ((select eh_administrador())) with check ((select eh_administrador()));
drop policy if exists "group_mapeamento: admin" on group_mapeamento;
create policy "group_mapeamento: admin" on group_mapeamento for all using ((select eh_administrador())) with check ((select eh_administrador()));
drop policy if exists "group_receitas: admin" on group_receitas;
create policy "group_receitas: admin" on group_receitas for all using ((select eh_administrador())) with check ((select eh_administrador()));
