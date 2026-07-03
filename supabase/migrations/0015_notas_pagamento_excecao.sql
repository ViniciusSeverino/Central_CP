-- Pagamento "comum" (recorrente/padrão) tem vencimento travado numa
-- quarta-feira fixa por semana de lançamento (ver src/js/vencimento_comum.js)
-- -- regra operacional do CSC pra concentrar a remessa bancária semanal.
-- Pagamento de exceção (CAPEX, impostos, FOPAG, allowance, DARE, rescisão,
-- Google/Facebook, energia, custas judiciais etc.) tem prazo próprio e
-- vencimento livre -- esse flag distingue os dois casos no formulário.
alter table notas add column pagamento_excecao boolean not null default false;
