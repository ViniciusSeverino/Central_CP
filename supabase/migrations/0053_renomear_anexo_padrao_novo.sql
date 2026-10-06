-- supabase/migrations/0053_renomear_anexo_padrao_novo.sql
--
-- O nome do PDF final de cada nota mudou de BSB_{PAGADOR}_... para
-- {PAGADOR}_BSB_... (pedido do dono do produto, ver nomeArquivoFinal em
-- anexos_pdf.js). Os arquivos já salvos são convertidos uma vez, pelo
-- administrador, em Configurações -> Armazenamento (ver
-- renomear_anexos.js): o app COPIA o arquivo para o nome novo, troca o
-- caminho em notas.anexos por esta função e só então apaga o antigo.
--
-- Função (security definer) em vez de um UPDATE direto: a RLS de
-- "notas: update" amarra quem edita a status/pendência da nota, e aqui o
-- que muda é só o caminho do arquivo, em qualquer status (inclusive
-- paga). Por isso ela mesma confere que quem chama é administrador e só
-- troca um caminho que já está na nota, dentro da pasta da própria nota.
create or replace function renomear_anexo_nota(p_nota_id uuid, p_antigo text, p_novo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not eh_administrador() then
    raise exception 'Só administrador pode renomear anexos.';
  end if;
  if split_part(p_antigo, '/', 1) <> p_nota_id::text or split_part(p_novo, '/', 1) <> p_nota_id::text then
    raise exception 'Caminho fora da pasta da nota.';
  end if;
  update notas set anexos = array_replace(anexos, p_antigo, p_novo)
  where id = p_nota_id and p_antigo = any(anexos);
  if not found then
    raise exception 'Anexo % não está na nota %.', p_antigo, p_nota_id;
  end if;
end;
$$;

revoke all on function renomear_anexo_nota(uuid, text, text) from public;
grant execute on function renomear_anexo_nota(uuid, text, text) to authenticated;
