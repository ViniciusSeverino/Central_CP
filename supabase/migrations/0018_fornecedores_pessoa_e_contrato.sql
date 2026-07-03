-- Cadastro de fornecedor ganha dados de contrato (documento WE9): PF/PJ
-- (com sugestão automática pelo CPF/CNPJ, mas editável -- a base de 872
-- fornecedores importados pode ter o documento incompleto ou mal
-- formatado), tipo de contratação padrão (reaproveita o enum já criado
-- pra notas.tipo_contratacao na migration 0017) e vigência do contrato,
-- que permite avisar quando uma NF referenciar contrato vencido ("devolver
-- NF se vencido", regra de conferência do CSC).
create type pessoa_tipo as enum ('PF', 'PJ');
alter table fornecedores add column pessoa_tipo pessoa_tipo;
alter table fornecedores add column tipo_contratacao_padrao tipo_contratacao;
alter table fornecedores add column contrato_vigencia_inicio date;
alter table fornecedores add column contrato_vigencia_fim date;
alter table fornecedores add column contrato_observacoes text;
