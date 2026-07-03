-- Prazo de pagamento por tipo de despesa (documento WE9 "Processos de
-- Contas a Pagar"): padrão vence D+30 corridos após a abertura do
-- chamado; CAPEX/impostos/allowance/FOPAG/transferência/distribuição/
-- reembolso/benefícios/SERASA vencem D+10 corridos; rescisão trabalhista
-- D+7 corridos; Google/Facebook/Mercado de Energia/custas judiciais D+3
-- úteis; DARE D+1 útil. Ver src/js/prazo_despesa.js pro cálculo.
--
-- "padrao" é o mesmo conceito de "não exceção" que já trava o vencimento
-- na quarta-feira (migration 0015) -- por isso `pagamento_excecao` (já
-- existente) passa a ser derivado de `tipo_despesa_prazo <> 'padrao'`
-- no momento de salvar a nota, em vez de um checkbox próprio.
create type tipo_despesa_prazo as enum ('padrao', 'd10', 'rescisao', 'd3_util', 'dare');
alter table notas add column tipo_despesa_prazo tipo_despesa_prazo not null default 'padrao';
