-- Central CP — migration 0029: perfil "recebedor" dentro do role departamento
-- Parte da sequência em supabase/migrations/ — aplique em ordem numérica
-- num banco novo (ver README.md, seção "Como colocar para rodar").
--
-- Problema do dono do produto: hoje só quem lança a nota inteira (dados +
-- classificação + anexo) recebe o documento do fornecedor, mas em cada
-- departamento várias pessoas diferentes recebem esses documentos na
-- prática. Solução: um perfil mais simples dentro do MESMO role
-- 'departamento' -- "recebedor" só anexa o(s) documento(s) e informa a
-- classificação (centro de custo/classe/código); a nota nasce com status
-- 'recebido' e fica numa fila do SETOR (não da pessoa) até um "completo"
-- do mesmo setor preencher o resto (valor, vencimento, pagador etc.) e
-- seguir o fluxo normal -- a partir daí ela vira uma nota comum (por isso
-- não existe um role novo nem RLS própria: a separação recebedor/completo
-- é só uma escolha de UI, ver ui_nota.js/ui_recebimento.js).
--
-- "Qualquer recebedor pode resolver" (decisão do dono do produto): a fila
-- de notas 'recebido' -- tanto pra completar quanto pra corrigir uma
-- devolução pedindo documento -- é do SETOR inteiro, não de quem criou.
-- Por isso o novo ramo das policies abaixo compara setor, não criado_por.

-- ---------------------------------------------------------------------
-- USUARIOS: nível dentro do role departamento.
-- ---------------------------------------------------------------------
alter table usuarios add column perfil_departamento text not null default 'completo'
  check (perfil_departamento in ('recebedor', 'completo'));

comment on column usuarios.perfil_departamento is
  'Só relevante pra role=departamento. "recebedor": só anexa documento(s) e informa a classificação (centro de custo/classe/código) -- não lança a nota inteira. "completo": lança do início ao fim, e também completa/corrige o que os recebedores do próprio setor mandam (ver notas.status=''recebido''). Não é uma trava de segurança à parte -- RLS trata os dois igual (mesmo role); a diferença é só o que a UI mostra.';

-- ---------------------------------------------------------------------
-- NOTAS: nova transição de UPDATE pra quem está no mesmo setor de uma
-- nota 'recebido', independente de quem criou. Reaplica a policy inteira
-- (ver 0024_cp_lanca_para_financeiro_e_todas_notas_geral.sql, é a versão
-- vigente) só acrescentando o ramo novo -- SELECT não precisa mudar: o
-- departamento já enxerga qualquer nota que não seja rascunho de outro
-- (0024), 'recebido' já cai nessa regra.
-- ---------------------------------------------------------------------
drop policy if exists "notas: update" on notas;
create policy "notas: update" on notas for update
  using (
    eh_super_usuario()
    or (
      'departamento' = ANY(papeis_efetivos())
      and pode_agir_como(criado_por)
      and (status in ('rascunho','lancado') or pendente = true)
    )
    or (
      'departamento' = ANY(papeis_efetivos())
      and setor = (select setor from usuario_atual())
      and status = 'recebido'
    )
    or (
      'contas_a_pagar' = ANY(papeis_efetivos())
      and status in ('aprovado','lancado_no_group','chamado_aberto','validado_csc')
    )
    or (
      'contas_a_pagar' = ANY(papeis_efetivos())
      and pode_agir_como(criado_por)
      and (status in ('rascunho','lancado') or pendente = true)
    )
  )
  with check (
    eh_super_usuario()
    or (
      'departamento' = ANY(papeis_efetivos())
      and pode_agir_como(criado_por)
      and status in ('rascunho','lancado','aprovado','lancado_no_group','chamado_aberto','validado_csc')
    )
    or (
      'departamento' = ANY(papeis_efetivos())
      and setor = (select setor from usuario_atual())
      and status in ('recebido','lancado','aprovado')
    )
    or (
      'contas_a_pagar' = ANY(papeis_efetivos())
      and status in ('aprovado','lancado_no_group','chamado_aberto','validado_csc','pago')
    )
    or (
      'contas_a_pagar' = ANY(papeis_efetivos())
      and pode_agir_como(criado_por)
      and status in ('rascunho','lancado','aprovado','lancado_no_group','chamado_aberto','validado_csc')
    )
  );

-- ---------------------------------------------------------------------
-- STORAGE (anexos-notas): mesmo ramo novo -- sem isso, o "completo" não
-- conseguiria baixar/substituir o anexo que o recebedor enviou (essas
-- policies são independentes da tabela notas, não herdam a mudança acima sozinhas).
-- Mantém o resto igual ao original (0011_storage_anexos.sql).
-- ---------------------------------------------------------------------
drop policy if exists "anexos-notas: select" on storage.objects;
create policy "anexos-notas: select" on storage.objects for select
  using (
    bucket_id = 'anexos-notas'
    and exists (
      select 1 from notas n
      where n.id::text = (storage.foldername(name))[1]
      and (
        eh_super_usuario()
        or ('departamento' = ANY(papeis_efetivos()) and pode_agir_como(n.criado_por))
        or ('departamento' = ANY(papeis_efetivos()) and n.setor = (select setor from usuario_atual()) and n.status = 'recebido')
        or ('contas_a_pagar' = ANY(papeis_efetivos()) and n.status <> 'rascunho')
      )
    )
  );

drop policy if exists "anexos-notas: insert" on storage.objects;
create policy "anexos-notas: insert" on storage.objects for insert
  with check (
    bucket_id = 'anexos-notas'
    and exists (
      select 1 from notas n
      where n.id::text = (storage.foldername(name))[1]
      and (
        eh_super_usuario()
        or ('departamento' = ANY(papeis_efetivos()) and pode_agir_como(n.criado_por))
        or ('departamento' = ANY(papeis_efetivos()) and n.setor = (select setor from usuario_atual()) and n.status = 'recebido')
        or ('contas_a_pagar' = ANY(papeis_efetivos()) and n.status <> 'rascunho')
      )
    )
  );

drop policy if exists "anexos-notas: delete" on storage.objects;
create policy "anexos-notas: delete" on storage.objects for delete
  using (
    bucket_id = 'anexos-notas'
    and exists (
      select 1 from notas n
      where n.id::text = (storage.foldername(name))[1]
      and (
        eh_super_usuario()
        or ('departamento' = ANY(papeis_efetivos()) and pode_agir_como(n.criado_por))
        or ('departamento' = ANY(papeis_efetivos()) and n.setor = (select setor from usuario_atual()) and n.status = 'recebido')
        or ('contas_a_pagar' = ANY(papeis_efetivos()) and n.status <> 'rascunho')
      )
    )
  );
