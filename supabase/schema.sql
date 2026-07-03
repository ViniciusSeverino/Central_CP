-- =====================================================================
-- Central CP — esquema de banco de dados (Supabase / Postgres)
-- =====================================================================
-- Como usar:
--   1. Crie um projeto em https://supabase.com
--   2. Abra SQL Editor → New query → cole este arquivo inteiro → Run
--   3. Confirme em Database → Tables que todas as tabelas foram criadas
-- =====================================================================

create extension if not exists "pgcrypto";
-- Instalada no schema `extensions` (convenção do Supabase) em vez de
-- `public` — mais organizado e reduz a superfície de objetos soltos no
-- schema público. É relocatable, então não afeta o índice gin que usa
-- gin_trgm_ops lá embaixo (ele referencia a operator class pelo OID
-- interno, não pelo nome do schema).
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- TIPOS (enums)
-- ---------------------------------------------------------------------
-- 'gestor' fica no enum só por compatibilidade histórica (Postgres não
-- remove valor de enum fácil) — não é mais um papel funcional, não existe
-- ramo pra ele em nenhuma policy. O aprovador é 'gerente_financeiro' (um
-- único, global, sem setor) e 'administrador' tem acesso total a tudo,
-- inclusive gerenciar usuários.
create type user_role as enum ('departamento', 'gestor', 'contas_a_pagar', 'gerente_financeiro', 'administrador');
create type setor_tipo as enum ('Marketing', 'Operações', 'Financeiro');
create type nota_status as enum (
  'rascunho', 'lancado', 'aprovado',
  'lancado_no_group', 'chamado_aberto', 'validado_csc',
  'pago', 'cancelada'
);
create type forma_pagamento_tipo as enum ('Boleto bancário', 'TED', 'Pix');
create type classificacao_tipo as enum ('Compras', 'Serviço', 'Outros');

-- ---------------------------------------------------------------------
-- USUÁRIOS — perfil de aplicação ligado ao Supabase Auth (auth.users)
-- ---------------------------------------------------------------------
create table usuarios (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  nome text not null,
  role user_role not null,
  setor setor_tipo, -- obrigatório para 'departamento'; nulo para os papéis globais
  email text, -- preenchido pela Edge Function de convite (client não lê auth.users)
  ativo boolean not null default true, -- desativado = trancado de tudo (ver usuario_atual())
  criado_em timestamptz not null default now(),
  constraint setor_obrigatorio_exceto_cap check (
    (role in ('contas_a_pagar', 'gerente_financeiro', 'administrador')) or (setor is not null)
  )
);

-- Função auxiliar: retorna a linha de `usuarios` do usuário autenticado atual
-- — só se estiver ativo, o que barra usuário desativado em toda policy que
-- depende dela de uma vez só, sem precisar repetir a checagem em cada uma.
create or replace function usuario_atual()
returns usuarios
language sql security definer stable
set search_path = public
as $$
  select * from usuarios where auth_user_id = auth.uid() and ativo = true;
$$;

-- ---------------------------------------------------------------------
-- DELEGAÇÕES — cobre férias/ausência: enquanto ativa e dentro do período,
-- o delegado assume as permissões do titular (papel global do titular +
-- identidade dele pra notas onde ele é o dono). Só administrador ou
-- gerente_financeiro criam/gerenciam uma delegação.
-- ---------------------------------------------------------------------
create table delegacoes (
  id uuid primary key default gen_random_uuid(),
  titular_id uuid not null references usuarios(id),
  delegado_id uuid not null references usuarios(id),
  data_inicio date not null,
  data_fim date not null,
  ativo boolean not null default true,
  motivo text,
  criado_por uuid not null references usuarios(id),
  criado_em timestamptz not null default now(),
  constraint delegado_diferente_titular check (delegado_id <> titular_id),
  constraint periodo_valido check (data_fim >= data_inicio)
);
create index idx_delegacoes_delegado on delegacoes(delegado_id);
create index idx_delegacoes_titular on delegacoes(titular_id);

-- Papéis que o usuário atual pode exercer agora: o próprio + o de qualquer
-- titular que tenha uma delegação ativa e dentro do período pra ele.
create or replace function papeis_efetivos()
returns user_role[]
language sql security definer stable
set search_path = public
as $$
  select coalesce(array_agg(distinct r), '{}')
  from (
    select role as r from usuarios where id = (select id from usuario_atual())
    union
    select u.role as r
    from delegacoes d
    join usuarios u on u.id = d.titular_id
    where d.delegado_id = (select id from usuario_atual())
      and d.ativo
      and current_date between d.data_inicio and d.data_fim
      and u.ativo
  ) x;
$$;

-- Pra checagens por identidade (ex: dono da nota), não por papel: o
-- usuário atual pode agir "como" um titular específico se for ele mesmo
-- ou se tiver uma delegação ativa dele.
create or replace function pode_agir_como(titular uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select titular = (select id from usuario_atual())
    or exists (
      select 1 from delegacoes d
      where d.delegado_id = (select id from usuario_atual())
        and d.titular_id = titular
        and d.ativo
        and current_date between d.data_inicio and d.data_fim
    );
$$;

create or replace function eh_super_usuario()
returns boolean
language sql stable
set search_path = public
as $$
  select papeis_efetivos() && array['administrador','gerente_financeiro']::user_role[];
$$;

create or replace function eh_operador_cadastro()
returns boolean
language sql stable
set search_path = public
as $$
  select eh_super_usuario() or 'contas_a_pagar' = ANY(papeis_efetivos());
$$;

-- Só administrador muda role/setor/ativo/email de um usuário. RLS é por
-- linha, não por coluna — quem garante isso de verdade é este trigger, não
-- a policy de update (que continua liberando o próprio usuário editar
-- coisas básicas do próprio perfil, tipo nome).
create or replace function bloquear_auto_promocao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Edge Function "convidar-usuario" roda com service_role (ignora RLS mas
  -- NÃO ignora trigger) — sem isso, ela nunca conseguiria desativar/reativar
  -- ninguém, incluindo a si mesma no bootstrap.
  if auth.role() = 'service_role' then
    return new;
  end if;
  if (select role from usuario_atual()) is distinct from 'administrador' then
    if new.role is distinct from old.role
       or new.setor is distinct from old.setor
       or new.ativo is distinct from old.ativo
       or new.email is distinct from old.email then
      raise exception 'Só um administrador pode alterar role, setor, e-mail ou status ativo de um usuário.';
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_bloquear_auto_promocao
  before update on usuarios
  for each row execute function bloquear_auto_promocao();

-- ---------------------------------------------------------------------
-- CADASTROS
-- ---------------------------------------------------------------------
create table pagadores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  sigla text not null unique
);

create table centros_custo (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  nome text not null,
  sigla text not null unique,
  origem_siglas text[] not null default '{}'
);

create table classes_conta (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  nome text not null,
  centro_custo_id uuid not null references centros_custo(id) on delete cascade
);

create table codigos_classificacao (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  nome text not null,
  classe_conta_id uuid not null references classes_conta(id) on delete cascade
);

create table fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  municipio text,
  cod_group text,
  criado_em timestamptz not null default now()
);

create table fornecedor_contas (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references fornecedores(id) on delete cascade,
  cod_banco text,
  agencia text,
  conta text
);

-- ---------------------------------------------------------------------
-- NOTAS
-- ---------------------------------------------------------------------
create table notas (
  id uuid primary key default gen_random_uuid(),
  data_emissao date,
  vencimento date,
  competencia date, -- primeiro dia do mês de competência contábil (ex: 2026-06-01 = "06/2026")
  numero_nota text,
  valor_bruto numeric(14,2) not null default 0,
  descricao text,
  anexos text[] default '{}',

  pagador_id uuid references pagadores(id),
  fornecedor_id uuid references fornecedores(id),
  forma_pagamento forma_pagamento_tipo,
  conta_bancaria_id uuid references fornecedor_contas(id),
  classificacao classificacao_tipo,

  tem_rateio boolean not null default false,
  centro_custo_id uuid references centros_custo(id),
  classe_conta_id uuid references classes_conta(id),
  codigo_classificacao_id uuid references codigos_classificacao(id),

  status nota_status not null default 'rascunho',
  pendente boolean not null default false,
  motivo_pendencia text,
  setor setor_tipo,

  aprovado_por uuid references usuarios(id),
  data_aprovacao timestamptz,
  comentario_aprovacao text,

  -- Etapa 1 do pós-aprovação: lançamento no ERP "Group".
  numero_lancamento_group text,
  data_lancamento_group timestamptz,

  -- Etapa 2: chamado aberto no Acelerato (CSC).
  numero_chamado text,
  data_chamado timestamptz,

  -- Etapa 3: CSC validou o chamado (antes de confirmar o pagamento).
  data_validacao_csc timestamptz,
  validado_por uuid references usuarios(id),

  data_pagamento date,

  -- Cancelamento (soft — a linha continua existindo, só sai das filas
  -- ativas): usado quando a nota já foi lançada no Group ou depois, ponto
  -- em que existe uma referência fora do Central CP e apagar de vez
  -- deixaria essa referência órfã. Ver trigger bloquear_cancelamento_de_paga.
  motivo_cancelamento text,
  cancelado_por uuid references usuarios(id),
  data_cancelamento timestamptz,

  criado_por uuid not null references usuarios(id),
  criado_em timestamptz not null default now(),

  -- Importação de histórico: criado_por é sempre quem importou (não dá
  -- pra apontar pra uma conta que nunca existiu) — esse campo guarda o
  -- nome do solicitante original como estava na planilha, só como
  -- referência de texto, quando não bateu com nenhuma conta cadastrada.
  solicitante_historico text
);

create table nota_rateios (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references notas(id) on delete cascade,
  valor numeric(14,2) not null,
  centro_custo_id uuid not null references centros_custo(id),
  classe_conta_id uuid not null references classes_conta(id),
  codigo_classificacao_id uuid references codigos_classificacao(id),
  descricao text
);

create table nota_historico (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references notas(id) on delete cascade,
  usuario_id uuid references usuarios(id),
  acao text not null,
  detalhe text,
  criado_em timestamptz not null default now(),
  -- 'app' (padrão) = movimentação normal, dispara o alerta por e-mail.
  -- 'importacao_historica' = criada pela importação em lote do
  -- administrador — não dispara e-mail (ver notificar_movimentacao),
  -- senão a importação de anos de histórico viraria um spam pra todo mundo.
  origem text not null default 'app'
);

-- ---------------------------------------------------------------------
-- ÍNDICES
-- ---------------------------------------------------------------------
create index idx_notas_status on notas(status);
create index idx_notas_setor on notas(setor);
create index idx_notas_criado_por on notas(criado_por);
create index idx_notas_pendente on notas(pendente);
create index idx_classes_centro on classes_conta(centro_custo_id);
create index idx_codigos_classe on codigos_classificacao(classe_conta_id);
create index idx_fornecedor_contas_fornecedor on fornecedor_contas(fornecedor_id);
create index idx_fornecedores_nome on fornecedores using gin (nome gin_trgm_ops);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table usuarios enable row level security;
alter table delegacoes enable row level security;
alter table pagadores enable row level security;
alter table centros_custo enable row level security;
alter table classes_conta enable row level security;
alter table codigos_classificacao enable row level security;
alter table fornecedores enable row level security;
alter table fornecedor_contas enable row level security;
alter table notas enable row level security;
alter table nota_rateios enable row level security;
alter table nota_historico enable row level security;

-- ---------------------------------------------------------------------
-- USUARIOS: qualquer autenticado lê todo mundo (precisa pra mostrar nome
-- de quem criou/aprovou). Cadastro FECHADO — não existe policy de insert
-- de propósito, então ninguém insere via client; só a Edge Function
-- "convidar-usuario", que roda com service_role (ignora RLS). Update:
-- o próprio usuário edita dados básicos do próprio perfil (nome), e
-- administrador edita qualquer um — mas quem muda role/setor/ativo/email
-- de verdade é o trigger bloquear_auto_promocao() lá em cima, não esta
-- policy (RLS não segura coluna, só linha).
-- ---------------------------------------------------------------------
create policy "usuarios: leitura geral" on usuarios for select
  using (auth.role() = 'authenticated');
create policy "usuarios: atualiza o próprio ou administrador atualiza qualquer um" on usuarios for update
  using (auth_user_id = auth.uid() or (select role from usuario_atual()) = 'administrador')
  with check (auth_user_id = auth.uid() or (select role from usuario_atual()) = 'administrador');

-- ---------------------------------------------------------------------
-- DELEGAÇÕES — cada um vê as próprias (como titular ou delegado); só
-- administrador/gerente_financeiro criam, editam ou revogam.
-- ---------------------------------------------------------------------
create policy "delegacoes: leitura" on delegacoes for select
  using (
    eh_super_usuario()
    or titular_id = (select id from usuario_atual())
    or delegado_id = (select id from usuario_atual())
  );
create policy "delegacoes: gerenciar" on delegacoes for all
  using (eh_super_usuario())
  with check (eh_super_usuario());

-- ---------------------------------------------------------------------
-- CADASTROS (pagadores, centros_custo, classes_conta, codigos_classificacao,
-- fornecedores, fornecedor_contas): leitura geral para autenticados (o
-- departamento precisa ler pra montar a nota); escrita (insert/update/
-- delete) pra quem opera cadastro — contas_a_pagar, gerente_financeiro e
-- administrador (ver eh_operador_cadastro()).
-- ---------------------------------------------------------------------
create policy "pagadores: leitura" on pagadores for select using (auth.role() = 'authenticated');
create policy "pagadores: escrita" on pagadores for all
  using (eh_operador_cadastro()) with check (eh_operador_cadastro());

create policy "centros_custo: leitura" on centros_custo for select using (auth.role() = 'authenticated');
create policy "centros_custo: escrita" on centros_custo for all
  using (eh_operador_cadastro()) with check (eh_operador_cadastro());

create policy "classes_conta: leitura" on classes_conta for select using (auth.role() = 'authenticated');
create policy "classes_conta: escrita" on classes_conta for all
  using (eh_operador_cadastro()) with check (eh_operador_cadastro());

create policy "codigos_classificacao: leitura" on codigos_classificacao for select using (auth.role() = 'authenticated');
create policy "codigos_classificacao: escrita" on codigos_classificacao for all
  using (eh_operador_cadastro()) with check (eh_operador_cadastro());

create policy "fornecedores: leitura" on fornecedores for select using (auth.role() = 'authenticated');
create policy "fornecedores: escrita" on fornecedores for all
  using (eh_operador_cadastro()) with check (eh_operador_cadastro());

create policy "fornecedor_contas: leitura" on fornecedor_contas for select using (auth.role() = 'authenticated');
create policy "fornecedor_contas: escrita" on fornecedor_contas for all
  using (eh_operador_cadastro()) with check (eh_operador_cadastro());

-- ---------------------------------------------------------------------
-- NOTAS — aqui sim a regra de negócio importa de verdade.
--
-- 'gestor' setor-scoped não existe mais: administrador e gerente_financeiro
-- (eh_super_usuario()) têm acesso total — veem tudo (inclusive rascunho),
-- aprovam e também executam as 4 ações do contas a pagar. papeis_efetivos()
-- e pode_agir_como() (ver bloco DELEGAÇÕES acima) incorporam delegação
-- ativa automaticamente, então nenhuma policy abaixo precisa saber que
-- delegação existe — só usa essas duas funções em vez de checar role/dono
-- direto.
-- ---------------------------------------------------------------------

-- SELECT:
--   super_usuario  → tudo, inclusive rascunho
--   departamento   → só as próprias (ou de quem te delegou), qualquer status
--   contas_a_pagar → todas, exceto rascunho
create policy "notas: select" on notas for select
  using (
    eh_super_usuario()
    or (
      'departamento' = ANY(papeis_efetivos())
      and pode_agir_como(criado_por)
    )
    or (
      'contas_a_pagar' = ANY(papeis_efetivos())
      and status <> 'rascunho'
    )
  );

-- INSERT:
--   departamento    → só em seu próprio nome/setor (delegação não cobre
--     criar nota nova em nome de outro — só processar o que já existe;
--     ver comentário na policy de update).
--   super_usuario (administrador/gerente_financeiro) → também lançam do
--     início ao fim. Não têm setor fixo (isentos pela constraint
--     setor_obrigatorio_exceto_cap), então não dá pra exigir
--     setor = setor do usuário como no ramo do departamento — a UI pede
--     pra eles escolherem o setor na hora; aqui só garante que a nota
--     fica em nome de quem está de fato logado.
create policy "notas: insert" on notas for insert
  with check (
    (
      (select role from usuario_atual()) = 'departamento'
      and criado_por = (select id from usuario_atual())
      and setor = (select setor from usuario_atual())
    )
    or (
      eh_super_usuario()
      and criado_por = (select id from usuario_atual())
    )
  );

-- UPDATE:
--   super_usuario (administrador/gerente_financeiro) → qualquer transição,
--     em qualquer etapa — inclusive pular direto pra 'pago' se precisar
--     corrigir algo.
--   departamento (dono, direto ou por delegação) → enquanto rascunho/lancado
--     (fluxo normal de envio), OU em qualquer etapa pós-aprovação enquanto
--     pendente=true — é assim que corrige os dados e devolve a nota depois
--     que o contas_a_pagar marca uma pendência.
--   contas_a_pagar → aprovado -> lancado_no_group -> chamado_aberto ->
--     validado_csc -> pago, uma etapa de cada vez, podendo marcar
--     pendente=true em qualquer uma dessas 4 etapas.
--
-- IMPORTANTE: sem um WITH CHECK explícito, o Postgres reaplica o USING acima
-- contra a linha NOVA (pós-update) — o que bloquearia toda transição de
-- status real. O WITH CHECK abaixo é deliberadamente mais permissivo que o
-- USING, liberando os status de destino válidos para cada papel. A única
-- garantia forte que continua no banco pro departamento comum: ele nunca
-- consegue levar uma nota até 'pago' sozinho, mesmo "resolvendo" uma
-- pendência — esse status fica de fora do WITH CHECK dele (super_usuario
-- não tem essa restrição, por isso o ramo dele vem primeiro e sem status).
create policy "notas: update" on notas for update
  using (
    eh_super_usuario()
    or (
      'departamento' = ANY(papeis_efetivos())
      and pode_agir_como(criado_por)
      and (status in ('rascunho','lancado') or pendente = true)
    )
    or (
      'contas_a_pagar' = ANY(papeis_efetivos())
      and status in ('aprovado','lancado_no_group','chamado_aberto','validado_csc')
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
      'contas_a_pagar' = ANY(papeis_efetivos())
      and status in ('aprovado','lancado_no_group','chamado_aberto','validado_csc','pago')
    )
  );

-- DELETE ("excluir de vez", só pré-Group — depois disso existe uma
-- referência fora do Central CP, ver comentário no cancelamento acima):
--   departamento    → só o próprio rascunho (nunca foi enviado).
--   super_usuario   → rascunho, aguardando aprovação ou aprovada.
-- Da etapa "lançado no Group" em diante, a única saída é o cancelamento
-- (UPDATE pra status='cancelada'), que super_usuario já tem liberado pela
-- policy de update acima (sem restrição de status nesse ramo) — o único
-- reforço extra é o trigger abaixo, barrando cancelar uma nota já paga.
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
  );

-- Uma nota já paga é uma transação financeira concluída — cancelar
-- corrigiria isso por fora do fluxo normal (precisaria de um processo de
-- estorno, que não existe ainda). Bloqueia só essa transição específica;
-- super_usuario continua podendo mover 'pago' pra outros status se
-- precisar corrigir algo (isso já existia e não é o que este trigger trata).
create or replace function bloquear_cancelamento_de_paga()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'pago' and new.status = 'cancelada' then
    raise exception 'Uma nota já paga não pode ser cancelada.';
  end if;
  return new;
end;
$$;

create trigger trg_bloquear_cancelamento_de_paga
  before update on notas
  for each row execute function bloquear_cancelamento_de_paga();

-- ---------------------------------------------------------------------
-- NOTA_RATEIOS — segue o dono da nota (direto ou por delegação) ou super.
-- ---------------------------------------------------------------------
create policy "nota_rateios: select" on nota_rateios for select
  using (exists (select 1 from notas n where n.id = nota_id));
create policy "nota_rateios: insert" on nota_rateios for insert
  with check (exists (
    select 1 from notas n
    where n.id = nota_id
    and (pode_agir_como(n.criado_por) or eh_super_usuario())
  ));
create policy "nota_rateios: delete" on nota_rateios for delete
  using (exists (
    select 1 from notas n
    where n.id = nota_id
    and (pode_agir_como(n.criado_por) or eh_super_usuario())
  ));

-- "Soma do rateio = valor bruto da nota" hoje só é checada no JS do
-- formulário. Este trigger garante a mesma regra no banco, como última
-- linha de defesa contra uma chamada direta à API ou um bug futuro na
-- tela. soma = 0 é tratado como "ainda não classificado" (não erro),
-- porque o fluxo de edição do app apaga os rateios antigos e insere os
-- novos em duas chamadas separadas (delete, depois insert) — sem essa
-- folga, a própria edição de nota quebraria no meio da troca. Precisa de
-- 3 funções (uma por evento) porque transition tables (old/new) não podem
-- ser usadas num único trigger que cubra insert+update+delete de uma vez.
create or replace function validar_soma_rateio_de(p_nota_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  soma numeric;
  vb numeric;
  tem_rat boolean;
begin
  select valor_bruto, tem_rateio into vb, tem_rat from notas where id = p_nota_id;
  if tem_rat then
    select coalesce(sum(valor), 0) into soma from nota_rateios where nota_id = p_nota_id;
    if soma > 0 and abs(soma - vb) > 0.01 then
      raise exception 'A soma do rateio (%) precisa ser igual ao valor bruto da nota (%).', soma, vb;
    end if;
  end if;
end;
$$;

create or replace function validar_soma_rateio_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare r record;
begin
  for r in (select distinct nota_id from new_rows) loop
    perform validar_soma_rateio_de(r.nota_id);
  end loop;
  return null;
end;
$$;

create or replace function validar_soma_rateio_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare r record;
begin
  for r in (select nota_id from old_rows union select nota_id from new_rows) loop
    perform validar_soma_rateio_de(r.nota_id);
  end loop;
  return null;
end;
$$;

create or replace function validar_soma_rateio_delete()
returns trigger
language plpgsql
set search_path = public
as $$
declare r record;
begin
  for r in (select distinct nota_id from old_rows) loop
    perform validar_soma_rateio_de(r.nota_id);
  end loop;
  return null;
end;
$$;

create trigger trg_validar_soma_rateio_insert
  after insert on nota_rateios
  referencing new table as new_rows
  for each statement
  execute function validar_soma_rateio_insert();

create trigger trg_validar_soma_rateio_update
  after update on nota_rateios
  referencing old table as old_rows new table as new_rows
  for each statement
  execute function validar_soma_rateio_update();

create trigger trg_validar_soma_rateio_delete
  after delete on nota_rateios
  referencing old table as old_rows
  for each statement
  execute function validar_soma_rateio_delete();

-- ---------------------------------------------------------------------
-- NOTA_HISTORICO — qualquer autenticado que pode ver a nota pode ver o
-- histórico. Inserir exige duas coisas: usuario_id tem que ser o próprio
-- chamador (sem isso, dava pra forjar uma entrada em nome de outra pessoa)
-- e a nota referenciada precisa existir E ser visível pra ele — o exists
-- herda automaticamente a policy "notas: select" (é uma query normal
-- contra uma tabela com RLS, não security definer).
-- ---------------------------------------------------------------------
create policy "nota_historico: select" on nota_historico for select
  using (auth.role() = 'authenticated');
create policy "nota_historico: insert" on nota_historico for insert
  with check (
    usuario_id = (select id from usuario_atual())
    and exists (select 1 from notas n where n.id = nota_id)
  );

-- =====================================================================
-- WEBHOOK: alerta por e-mail a cada movimentação
-- =====================================================================
-- Toda vez que uma linha nova entra em nota_historico (ou seja, toda
-- movimentação de qualquer nota), esse trigger chama a Edge Function
-- "notificar-movimentacao" via pg_net (assíncrono — não trava a escrita
-- da nota se o e-mail demorar ou falhar). A função decide quem é o
-- responsável pela etapa ATUAL da nota e manda o e-mail via Resend.
--
-- Troque a URL e a anon key abaixo se for configurar em outro projeto —
-- os valores aqui são os do projeto de produção (a anon key é pública
-- por design, mesma que já vai em src/js/config.js).
-- Fica em `public` de propósito, não por descuido: pg_net não é
-- relocatable (testado — "ALTER EXTENSION pg_net SET SCHEMA" é recusado
-- pelo Postgres) e sempre cria seus próprios objetos (net.http_post etc.)
-- no schema fixo `net`, então mover o registro da extensão não muda nada
-- na prática — só valeria a pena via um drop+recreate, o que arrisca
-- derrubar o webhook de e-mail em produção por um lint organizacional.
create extension if not exists pg_net;

create or replace function notificar_movimentacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Importação em lote de histórico: não manda e-mail — senão importar
  -- anos de notas antigas vira um spam pra todo mundo de uma vez.
  if new.origem = 'importacao_historica' then
    return new;
  end if;
  perform net.http_post(
    url := 'https://ofzqboxmlfogstpjaxdq.supabase.co/functions/v1/notificar-movimentacao',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9menFib3htbGZvZ3N0cGpheGRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNjY4MTUsImV4cCI6MjA5Nzc0MjgxNX0.li2PLlz0eE68WhenrX4DE5WhZR4tw814VOgHRD2PF2w'
    ),
    body := jsonb_build_object('historico_id', new.id)
  );
  return new;
end;
$$;

create trigger trg_notificar_movimentacao
  after insert on nota_historico
  for each row execute function notificar_movimentacao();

-- =====================================================================
-- STORAGE: anexos das notas (PDF/boleto)
-- =====================================================================
-- Bucket privado — antes o campo "anexos" só guardava um nome de arquivo
-- digitado, o documento em si circulava por fora do sistema. Path de cada
-- objeto: "{nota_id}/{timestamp}-{nome}" — o primeiro segmento do caminho
-- é o nota_id, e as policies abaixo espelham a mesma regra de
-- visibilidade de "notas: select": quem pode ver a nota pode ler/anexar/
-- remover os arquivos dela.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'anexos-notas', 'anexos-notas', false, 15728640,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

create policy "anexos-notas: select" on storage.objects for select
  using (
    bucket_id = 'anexos-notas'
    and exists (
      select 1 from notas n
      where n.id::text = (storage.foldername(name))[1]
      and (
        eh_super_usuario()
        or ('departamento' = ANY(papeis_efetivos()) and pode_agir_como(n.criado_por))
        or ('contas_a_pagar' = ANY(papeis_efetivos()) and n.status <> 'rascunho')
      )
    )
  );

create policy "anexos-notas: insert" on storage.objects for insert
  with check (
    bucket_id = 'anexos-notas'
    and exists (
      select 1 from notas n
      where n.id::text = (storage.foldername(name))[1]
      and (
        eh_super_usuario()
        or ('departamento' = ANY(papeis_efetivos()) and pode_agir_como(n.criado_por))
        or ('contas_a_pagar' = ANY(papeis_efetivos()) and n.status <> 'rascunho')
      )
    )
  );

create policy "anexos-notas: delete" on storage.objects for delete
  using (
    bucket_id = 'anexos-notas'
    and exists (
      select 1 from notas n
      where n.id::text = (storage.foldername(name))[1]
      and (
        eh_super_usuario()
        or ('departamento' = ANY(papeis_efetivos()) and pode_agir_como(n.criado_por))
        or ('contas_a_pagar' = ANY(papeis_efetivos()) and n.status <> 'rascunho')
      )
    )
  );
