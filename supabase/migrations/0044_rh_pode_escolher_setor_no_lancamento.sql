-- supabase/migrations/0044_rh_pode_escolher_setor_no_lancamento.sql
--
-- Continuação de 0043 (departamento "RH" já existe em setor_tipo depois
-- daquele migration rodar) -- aqui sim a mudança de comportamento: quando
-- o setor de quem lança é 'RH', a nota pode nascer em QUALQUER setor, não
-- só no próprio RH (mesmo campo "Setor" que administrador/
-- gerente_financeiro/contas_a_pagar já escolhem na hora de lançar, ver
-- "notas: insert" em 0008/0024) -- o resto do fluxo (aprovação, pendência,
-- etc.) segue o setor escolhido, não o do lançador, porque notas.setor já
-- é um campo próprio da nota, não derivado de quem criou.
--
-- Reescreve só o ramo "departamento" de "notas: insert" -- os outros ramos
-- (super_usuario, contas_a_pagar-Financeiro) ficam iguais a 0024.
drop policy if exists "notas: insert" on notas;
create policy "notas: insert" on notas for insert
  with check (
    (
      (select role from usuario_atual()) = 'departamento'
      and criado_por = (select id from usuario_atual())
      and (
        setor = (select setor from usuario_atual())
        or (select setor from usuario_atual()) = 'RH'
      )
    )
    or (
      eh_super_usuario()
      and criado_por = (select id from usuario_atual())
    )
    or (
      (select role from usuario_atual()) = 'contas_a_pagar'
      and criado_por = (select id from usuario_atual())
      and setor = 'Financeiro'
    )
  );
