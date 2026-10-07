-- supabase/migrations/0057_group_detalhes.sql
--
-- Mais colunas do relatório "Pesquisa de Despesas" do Group (ver 0056 e
-- group_importacao.js), pra conciliação identificar o lançamento sem
-- abrir o Group: descrição, favorecido, datas de criação e liquidação,
-- conta corrente (Referencia), documento/borderô e parcela. A RLS da
-- tabela (só administrador) não muda. Basta reimportar o CSV depois.
alter table group_lancamentos add column if not exists descricao text;
alter table group_lancamentos add column if not exists favorecido text;
alter table group_lancamentos add column if not exists referencia text;
alter table group_lancamentos add column if not exists documento text;
alter table group_lancamentos add column if not exists parcela text;
alter table group_lancamentos add column if not exists criacao date;
alter table group_lancamentos add column if not exists liquidacao date;
