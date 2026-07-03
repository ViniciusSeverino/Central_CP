-- Central CP — migration 0006: liga RLS em todas as tabelas
-- Parte da sequência em supabase/migrations/ — aplique em ordem numérica
-- num banco novo (ver README.md, seção "Como colocar para rodar").

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
