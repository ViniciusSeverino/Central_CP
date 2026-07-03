-- Central CP — migration 0005: notas, rateios, histórico + índices
-- Parte da sequência em supabase/migrations/ — aplique em ordem numérica
-- num banco novo (ver README.md, seção "Como colocar para rodar").

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
