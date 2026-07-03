-- Tipo de contratação (sob demanda / mensal) -- coluna "Contrato" na
-- tabela padrão de abertura de chamado do CSC (documento WE9). Opcional
-- (nem toda nota precisa dessa classificação) -- fica "—" na tabela
-- gerada (ver src/js/chamado_texto.js) até ser preenchida.
create type tipo_contratacao as enum ('sob_demanda', 'mensal');
alter table notas add column tipo_contratacao tipo_contratacao;
