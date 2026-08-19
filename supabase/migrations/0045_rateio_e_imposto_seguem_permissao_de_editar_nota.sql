-- supabase/migrations/0045_rateio_e_imposto_seguem_permissao_de_editar_nota.sql
--
-- Bug real relatado pelo contas a pagar: "ao editar uma nota e clicar em
-- salvar aparece um erro, porém ao atualizar a página identificamos que a
-- alteração foi feita". Causa -- mesma classe de bug já corrigida pros
-- anexos em 0041: "notas: update" já libera o CP (e, desde 0042, um
-- colega do mesmo setor resolvendo pendência) a editar uma nota que não
-- criou, mas "nota_rateios"/"nota_impostos" (reescritas inteiras a cada
-- salvamento por salvarRateios/salvarImpostos em db.js -- apaga tudo e
-- reinsere, mesmo se as linhas não mudaram) NUNCA acompanharam essa
-- mudança: a policy de insert/delete delas (0009/0019, nunca revisada)
-- ainda é só "pode_agir_como(criado_por) ou eh_super_usuario()".
--
-- Sequência real do bug: db.atualizarNota() faz o UPDATE em `notas`
-- primeiro (commita sozinho, sem transação com o resto) e SÓ DEPOIS chama
-- salvarRateios/salvarImpostos -- se a nota tem rateio ou imposto
-- (qualquer um dos dois já é comum), o INSERT nas tabelas de apoio esbarra
-- na RLS pra quem não é dono nem super_usuario (CP editando nota de
-- departamento, ou colega de setor resolvendo pendência), a função lança
-- erro, o catch do botão mostra o erro -- mas a nota em si já tinha sido
-- salva antes disso.
--
-- Correção: extrai a MESMA condição de "notas: update" (versão vigente,
-- 0042) numa função reutilizável, e troca a condição de insert/delete das
-- duas tabelas de apoio por ela -- agora é literalmente "quem pode editar
-- a nota edita as linhas de rateio/imposto dela", sem duplicar a lista de
-- ramos em mais dois lugares (o que já tinha causado esse desalinhamento
-- uma vez).
create or replace function pode_editar_nota(p_nota_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from notas n
    where n.id = p_nota_id
    and (
      eh_super_usuario()
      or (
        'departamento' = ANY(papeis_efetivos())
        and pode_agir_como(n.criado_por)
        and n.status in ('rascunho','rascunho_recebimento','lancado')
      )
      or (
        'departamento' = ANY(papeis_efetivos())
        and n.setor = (select setor from usuario_atual())
        and (n.status = 'recebido' or n.pendente = true)
      )
      or (
        'contas_a_pagar' = ANY(papeis_efetivos())
        and n.status in ('lancado','aprovado','lancado_no_group','chamado_aberto','validado_csc')
      )
      or (
        'contas_a_pagar' = ANY(papeis_efetivos())
        and pode_agir_como(n.criado_por)
        and (n.status in ('rascunho','lancado') or n.pendente = true)
      )
    )
  );
$$;

comment on function pode_editar_nota(uuid) is
  'Espelha a condição vigente de "notas: update" (USING) -- fonte única pra quem pode editar rateio/imposto de uma nota (nota_rateios, nota_impostos), evitando o tipo de desalinhamento que causou o bug corrigido nesta migration. Se "notas: update" mudar de novo, atualize aqui também.';

drop policy if exists "nota_rateios: insert" on nota_rateios;
create policy "nota_rateios: insert" on nota_rateios for insert
  with check (pode_editar_nota(nota_id));

drop policy if exists "nota_rateios: delete" on nota_rateios;
create policy "nota_rateios: delete" on nota_rateios for delete
  using (pode_editar_nota(nota_id));

drop policy if exists "nota_impostos: insert" on nota_impostos;
create policy "nota_impostos: insert" on nota_impostos for insert
  with check (pode_editar_nota(nota_id));

drop policy if exists "nota_impostos: delete" on nota_impostos;
create policy "nota_impostos: delete" on nota_impostos for delete
  using (pode_editar_nota(nota_id));
