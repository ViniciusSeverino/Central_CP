-- supabase/migrations/0043_rh_escolhe_departamento.sql
--
-- Pedido do dono do produto: o lançador do setor RH precisa poder escolher
-- qual departamento é o responsável por continuar o lançamento. Pré-
-- requisito: o departamento "RH" precisa existir em setor_tipo -- hoje só
-- existem Marketing/Operações/Financeiro (mais o que administrador tiver
-- criado depois via Configurações → Cadastros → Departamentos, ver
-- criar_setor() em 0034). Cria "RH" aqui do mesmo jeito que aquela função
-- faz (ALTER TYPE ... ADD VALUE + linha de config em `setores`), pra não
-- depender de um passo manual à parte antes da policy do próximo migration
-- (0044) poder comparar `= 'RH'`.
--
-- Precisa ser o ÚNICO efeito deste arquivo: ALTER TYPE ... ADD VALUE não
-- pode ser usado (nem em comparação de igualdade) na MESMA transação em
-- que foi adicionado (Postgres 12+) -- por isso o ramo de RLS que compara
-- setor = 'RH' vai num migration seguinte (0044), depois deste já ter
-- rodado (aplicando um arquivo de cada vez, na ordem, como sempre -- ver
-- README).
alter type setor_tipo add value if not exists 'RH';

insert into setores (nome)
select 'RH'
where not exists (select 1 from setores where nome = 'RH');
