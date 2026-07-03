-- Central CP — migration 0014: RPC arquivar_anexos_lote()
-- Parte da sequência em supabase/migrations/ — aplique em ordem numérica
-- num banco novo (ver README.md, seção "Como colocar para rodar").

-- A policy "notas: update" (migration 0008) restringe contas_a_pagar a
-- mexer numa nota só enquanto ela está em 'aprovado'..'validado_csc' — uma
-- nota já 'pago' (o caso mais comum pra arquivar: processo encerrado) cai
-- fora do USING dessa policy pra esse papel, então um UPDATE de
-- anexo_arquivado_em feito como contas_a_pagar simplesmente não afeta
-- nenhuma linha (sem erro — só 0 linhas), deixando o arquivo já apagado do
-- Storage só com o front-end achando que arquivou, sem o marcador salvo no
-- banco. RPC security definer, decoupled da policy geral de update, faz só
-- essa operação específica (mais estreita que abrir a policy geral de
-- update pra contas_a_pagar mexer em nota paga por qualquer motivo).
create or replace function arquivar_anexos_lote(p_nota_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
begin
  if not eh_operador_cadastro() then
    raise exception 'Sem permissão para arquivar anexos.';
  end if;

  select id into v_usuario_id from usuarios where auth_user_id = auth.uid();

  -- O trigger bloquear_arquivamento_sem_chamado (migration 0012) continua
  -- valendo aqui normalmente (trigger de linha dispara independente de
  -- security definer) — barra qualquer nota sem chamado aberto. "and
  -- anexo_arquivado_em is null" evita logar histórico duplicado pra nota
  -- que já tivesse sido arquivada antes (a UI já filtra isso, é só reforço).
  with arquivadas as (
    update notas
    set anexo_arquivado_em = now()
    where id = any(p_nota_ids) and anexo_arquivado_em is null
    returning id
  )
  insert into nota_historico (nota_id, usuario_id, acao, detalhe)
  select id, v_usuario_id, 'Anexo arquivado e removido do Storage', 'Baixado em lote e movido para a rede local da empresa'
  from arquivadas;
end;
$$;

revoke all on function arquivar_anexos_lote(uuid[]) from public;
grant execute on function arquivar_anexos_lote(uuid[]) to authenticated;
