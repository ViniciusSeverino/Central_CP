-- supabase/migrations/0027_caixinha_por_setor.sql
--
-- Caixinha agora é vinculada a um setor (Marketing/Operações/Financeiro):
-- departamento só vê e movimenta a caixinha do PRÓPRIO setor -- decisão
-- explícita do dono do produto (Fundo -> Marketing, Vértico -> Operações,
-- Consórcio -> Financeiro). contas_a_pagar/gerente_financeiro/
-- administrador continuam com acesso a TODAS as caixinhas, sem recorte
-- (só editar o teto que já era restrito a gerente_financeiro/
-- administrador, ver 0026_caixinha_teto_so_super_usuario.sql).

alter table caixinhas add column setor setor_tipo;
update caixinhas set setor = 'Financeiro' where nome = 'Consórcio';
update caixinhas set setor = 'Operações' where nome = 'Vértico';
update caixinhas set setor = 'Marketing' where nome = 'Fundo';
alter table caixinhas alter column setor set not null;

drop policy if exists "caixinhas: leitura" on caixinhas;
create policy "caixinhas: leitura" on caixinhas for select
  using (
    eh_super_usuario()
    or 'contas_a_pagar' = ANY(papeis_efetivos())
    or (
      'departamento' = ANY(papeis_efetivos())
      and setor = (select setor from usuario_atual())
    )
  );

drop policy if exists "caixinha_movimentacoes: leitura" on caixinha_movimentacoes;
create policy "caixinha_movimentacoes: leitura" on caixinha_movimentacoes for select
  using (
    eh_super_usuario()
    or 'contas_a_pagar' = ANY(papeis_efetivos())
    or (
      'departamento' = ANY(papeis_efetivos())
      and exists (
        select 1 from caixinhas c
        where c.id = caixinha_movimentacoes.caixinha_id
        and c.setor = (select setor from usuario_atual())
      )
    )
  );

-- INSERT: contas_a_pagar continua podendo registrar em qualquer caixinha;
-- departamento só na do próprio setor (mesmo raciocínio da leitura acima).
drop policy if exists "caixinha_movimentacoes: insert" on caixinha_movimentacoes;
create policy "caixinha_movimentacoes: insert" on caixinha_movimentacoes for insert
  with check (
    criado_por = (select id from usuario_atual())
    and (
      (eh_super_usuario() and status = 'aprovado')
      or (
        not eh_super_usuario()
        and status = 'pendente_aprovacao'
        and (
          'contas_a_pagar' = ANY(papeis_efetivos())
          or exists (
            select 1 from caixinhas c
            where c.id = caixinha_movimentacoes.caixinha_id
            and c.setor = (select setor from usuario_atual())
          )
        )
      )
    )
  );
