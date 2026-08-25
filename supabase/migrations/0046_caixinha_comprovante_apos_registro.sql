-- supabase/migrations/0046_caixinha_comprovante_apos_registro.sql
--
-- Bug relatado: "os comprovantes anexados no caixinha não estão ficando
-- disponíveis". Mesma classe de bug já corrigida em 0041/0045 (uma ação
-- real do fluxo nunca foi contemplada quando a policy de RLS foi escrita).
--
-- Sequência real: db.registrarMovimentacaoCaixinha() cria a movimentação;
-- se a pessoa escolheu um arquivo, db.uploadComprovanteCaixinha() sobe o
-- arquivo pro bucket (policy do bucket é aberta pra qualquer autenticado,
-- funciona) e DEPOIS faz
--   update caixinha_movimentacoes set comprovante = <caminho> where id = ...
-- -- só isso, sem mudar o status. Mas a policy "caixinha_movimentacoes:
-- update" (0025, nunca revisada) só existe pensando na ação de
-- aprovar/rejeitar: exige eh_super_usuario() E status='pendente_aprovacao'
-- (using) transicionando pra 'aprovado'/'rejeitado' (with check). Um
-- UPDATE que só seta `comprovante` sem mudar status nunca bate nem no
-- using (quem não é super_usuario -- ou seja, quem normalmente anexa o
-- próprio comprovante) nem no with check (mesmo pra super_usuario, cujo
-- with check só aceita status final aprovado/rejeitado -- e numa
-- movimentação já nascida 'aprovado', caso do próprio super_usuario, nem
-- o using bate, porque exige status='pendente_aprovacao'). Resultado: RLS
-- filtra a linha, o UPDATE afeta 0 linhas, supabase-js não reporta erro
-- nenhum (não é violação de with check, só nenhuma linha visível pra
-- editar) -- o arquivo fica órfão no Storage e a coluna `comprovante`
-- nunca é preenchida, então a UI nunca mostra o link "Ver".
--
-- Correção em duas partes:
--
-- 1) Trigger que bloqueia qualquer mudança de status por quem não é
--    super_usuario -- ANTES de mexer na policy abaixo, porque só ela
--    (using contra a linha ANTIGA, with check contra a linha NOVA, sem
--    like nenhum jeito de comparar as duas na mesma cláusula) não
--    consegue garantir sozinha que "o dono só edita SEM trocar de status"
--    quando os dois status permitidos (pendente_aprovacao e aprovado)
--    aparecem em ramos separados de using/with check -- combinando um
--    ramo do using com outro ramo do with check, dava pra um departamento
--    "aprovar" a própria movimentação sozinho. O trigger fecha esse
--    buraco de vez, independente de como a policy é escrita depois --
--    mesmo padrão já usado em bloquear_cancelamento_de_paga (0008) e
--    bloquear_auto_promocao (0003).
create or replace function bloquear_mudanca_status_caixinha_por_nao_super_usuario()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status and not eh_super_usuario() then
    raise exception 'Só quem tem autoridade de aprovação pode mudar o status da movimentação.';
  end if;
  return new;
end;
$$;

create trigger trg_bloquear_mudanca_status_caixinha
  before update on caixinha_movimentacoes
  for each row execute function bloquear_mudanca_status_caixinha_por_nao_super_usuario();

-- 2) Reescreve a policy: acrescenta dois ramos pro DONO da movimentação
--    (ou delegado) atualizar a PRÓPRIA linha (setar o comprovante, por
--    exemplo) enquanto ela estiver 'pendente_aprovacao' ou 'aprovado' --
--    o trigger acima é quem garante de verdade que isso nunca vira uma
--    troca de status disfarçada. O ramo de aprovar/rejeitar do
--    super_usuario continua exatamente como estava.
drop policy if exists "caixinha_movimentacoes: update" on caixinha_movimentacoes;
create policy "caixinha_movimentacoes: update" on caixinha_movimentacoes for update
  using (
    (eh_super_usuario() and status = 'pendente_aprovacao')
    or (pode_agir_como(criado_por) and status in ('pendente_aprovacao', 'aprovado'))
  )
  with check (
    (eh_super_usuario() and status in ('aprovado', 'rejeitado'))
    or (pode_agir_como(criado_por) and status in ('pendente_aprovacao', 'aprovado'))
  );
