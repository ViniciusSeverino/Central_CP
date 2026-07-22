-- Devolução de pendência de uma nota "recebida" (perfil recebedor, ver
-- migration 0029): a UI tinha dois botões "Corrigir e devolver" nesse caso
-- -- um reabria o formulário completo, outro o simplificado -- porque a
-- condição de DELETE/ações não excluía 'recebido' da regra genérica de
-- pendência (ver ui_nota.js). A correção trocou o botão duplicado (o do
-- formulário completo) por "Excluir": é lançamento simples que nunca saiu
-- do "recebido", nada fora do Central CP referencia ainda, então excluir de
-- vez é seguro (sem o risco de perda de rastro que uma nota mais adiante no
-- fluxo teria). 'recebido'+pendente não estava coberto por nenhuma branch
-- de DELETE existente (só rascunho/rascunho_recebimento do dono, ou
-- rascunho/lancado/aprovado do super usuário) -- por isso precisa da
-- policy nova.
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
      and pendente = true
    )
    or (
      eh_super_usuario()
      and status in ('rascunho', 'lancado', 'aprovado')
    )
    or (
      'administrador' = ANY(papeis_efetivos())
    )
  );
