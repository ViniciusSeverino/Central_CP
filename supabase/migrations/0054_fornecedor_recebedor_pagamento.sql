-- supabase/migrations/0054_fornecedor_recebedor_pagamento.sql
--
-- Caso raro pedido pelo dono do produto: o fornecedor emite a nota num
-- CNPJ, mas o pagamento tem que ir para outro (matriz e filial).
--
-- fornecedores.recebedor_pagamento_id: o (único) CNPJ que recebe em nome
--   deste fornecedor, ele mesmo cadastrado como fornecedor (com as contas
--   bancárias dele). Nulo = recebe o próprio emissor (o caso normal).
-- notas.fornecedor_recebedor_id: escolha feita no lançamento (seletor
--   "Quem recebe o pagamento", ver renderContaBancariaArea em ui_nota.js).
--   Nulo = o pagamento vai ao emissor da NF. A conta bancária da nota
--   (conta_bancaria_id) passa a ser uma conta de quem recebe.
--
-- As políticas de RLS das duas tabelas já cobrem colunas novas (são por
-- linha), nada a criar.
alter table fornecedores
  add column if not exists recebedor_pagamento_id uuid references fornecedores(id) on delete set null;
alter table fornecedores
  drop constraint if exists fornecedores_recebedor_diferente;
alter table fornecedores
  add constraint fornecedores_recebedor_diferente check (recebedor_pagamento_id is null or recebedor_pagamento_id <> id);

alter table notas
  add column if not exists fornecedor_recebedor_id uuid references fornecedores(id);
