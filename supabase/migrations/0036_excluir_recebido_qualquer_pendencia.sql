-- Amplia a migration 0035: o dono do produto queria "Excluir" em QUALQUER
-- nota "recebido" do perfil "completo" (não só quando já estava marcada
-- pendente) -- é lançamento simples que nunca saiu do "recebido", nada
-- fora do Central CP referencia ainda, então excluir de vez continua
-- seguro nos dois casos. Só tira a condição "pendente = true" da branch
-- adicionada em 0035; o resto da policy fica igual.
drop policy if exists "notas: delete" on notas;
create policy "notas: delete" on notas for delete
  using (
    (
      'departamento' = ANY(papeis_efetivos())
      and pode_agir_como(criado_por)
      and status in ('rascunho','rascunho_recebimento')
    )
    or (
      'departamento' = ANY(papeis_efetivos())
      and (select perfil_departamento from usuario_atual()) = 'completo'
      and setor = (select setor from usuario_atual())
      and status = 'recebido'
    )
    or (
      eh_super_usuario()
      and status in ('rascunho', 'lancado', 'aprovado')
    )
    or (
      'administrador' = ANY(papeis_efetivos())
    )
  );
