-- supabase/migrations/0039_caixinha_sem_teto.sql
--
-- Pedido do dono do produto: a caixinha não precisa de um valor-teto
-- configurável (0025_caixinha_fundo_fixo.sql) -- o controle passa a ser só
-- o saldo em si (reforços - saídas, ver saldoCaixinha() em caixinha.js),
-- sem nenhuma referência/limite pra comparar contra. Remove a coluna de
-- vez (não só o uso na UI) -- não faz sentido continuar exigindo um valor
-- (o check valor_teto > 0 obrigava até um placeholder no cadastro) pra um
-- conceito que deixou de existir.
alter table caixinhas drop column valor_teto;
