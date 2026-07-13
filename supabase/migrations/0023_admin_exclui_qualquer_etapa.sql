-- supabase/migrations/0023_admin_exclui_qualquer_etapa.sql
--
-- Decisão explícita do dono do produto: administrador (ou quem estiver
-- cobrindo administrador por delegação) pode excluir uma nota de vez em
-- QUALQUER etapa, inclusive já paga ou cancelada -- diferente do resto do
-- app, que trata "pago" como estado final protegido (ver
-- bloquear_cancelamento_de_paga em 0008_rls_notas.sql). Isso não muda: o
-- gatilho ali só bloqueia a transição UPDATE pago→cancelada, nunca afetou
-- DELETE, então nenhuma alteração é necessária nele.
--
-- departamento (só o próprio rascunho) e gerente_financeiro/administrador
-- pré-Group (rascunho/lançado/aprovado) continuam exatamente como antes --
-- este branch novo só adiciona uma permissão a mais pro administrador,
-- não tira nada de ninguém.
drop policy if exists "notas: delete" on notas;

create policy "notas: delete" on notas for delete
  using (
    (
      'departamento' = ANY(papeis_efetivos())
      and pode_agir_como(criado_por)
      and status = 'rascunho'
    )
    or (
      eh_super_usuario()
      and status in ('rascunho', 'lancado', 'aprovado')
    )
    or (
      'administrador' = ANY(papeis_efetivos())
    )
  );
