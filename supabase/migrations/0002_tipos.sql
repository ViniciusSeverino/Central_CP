-- Central CP — migration 0002: enums usados pelas tabelas
-- Parte da sequência em supabase/migrations/ — aplique em ordem numérica
-- num banco novo (ver README.md, seção "Como colocar para rodar").

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
