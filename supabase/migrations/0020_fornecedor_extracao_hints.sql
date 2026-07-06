-- Central CP — migration 0020: dicas de extração aprendidas por fornecedor
-- Parte da sequência em supabase/migrations/ — aplique em ordem numérica
-- num banco novo (ver README.md, seção "Como colocar para rodar").
--
-- Quando o leitor de documentos (leitor_documentos.js) não acha um campo
-- (número da nota, valor) ou não identifica o tipo do documento, o painel
-- de auditoria pergunta pra pessoa e guarda a resposta aqui, associada ao
-- FORNECEDOR — documentos do mesmo fornecedor tendem a ter o mesmo layout
-- (mesmo sistema de faturamento gerou todos), então uma "âncora" (o texto
-- que aparece logo antes do valor certo) aprendida numa nota serve pras
-- próximas do mesmo fornecedor. É conhecimento compartilhado (não por
-- usuário) -- qualquer pessoa autenticada pode consultar e ensinar.

create table fornecedor_extracao_hints (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references fornecedores(id) on delete cascade,
  campo text not null check (campo in ('numeroNota', 'valor', 'cnpj', 'cpf', 'data', 'tipo')),
  -- Pro campo 'tipo', não há âncora de texto -- ancora fica vazia e
  -- valor_exemplo guarda o tipo de documento escolhido diretamente
  -- (nota_fiscal, boleto, etc.), ver TIPO_DOCUMENTO_LABEL em
  -- leitor_documentos.js.
  ancora text not null default '',
  valor_exemplo text,
  criado_por uuid references usuarios(id),
  atualizado_em timestamptz not null default now(),
  unique (fornecedor_id, campo)
);

alter table fornecedor_extracao_hints enable row level security;

create policy "fornecedor_extracao_hints: select" on fornecedor_extracao_hints for select
  using (auth.role() = 'authenticated');
create policy "fornecedor_extracao_hints: insert" on fornecedor_extracao_hints for insert
  with check (criado_por = (select id from usuario_atual()));
create policy "fornecedor_extracao_hints: update" on fornecedor_extracao_hints for update
  using (auth.role() = 'authenticated')
  with check (criado_por = (select id from usuario_atual()));
