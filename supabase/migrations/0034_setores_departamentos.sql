-- Central CP — migration 0034: setores (departamentos) cadastráveis
-- Parte da sequência em supabase/migrations/ — aplique em ordem numérica
-- num banco novo (ver README.md, seção "Como colocar para rodar").
--
-- Pedido do dono do produto: administrador cria novos departamentos (até
-- aqui, setor_tipo era um enum fixo com só 3 valores -- Marketing,
-- Operações, Financeiro -- não dava pra acrescentar sem uma migration) e
-- configura pré-preenchimentos por departamento, como o pagador padrão
-- (ver pagadorPadraoParaSetor em state.js, que até aqui vinha de um mapa
-- fixo no próprio JS).
--
-- Decisão de design: NÃO troca setor_tipo por uma FK pra essa tabela nas
-- 3 tabelas que já usam esse enum (usuarios/notas/caixinhas) -- isso
-- exigiria reescrever toda RLS que compara `setor = (select setor from
-- usuario_atual())` e o código JS que já trata `.setor` como uma string
-- (nome do setor). Em vez disso, esta tabela só GUARDA a config extra por
-- setor (pagador padrão, e no futuro outros pré-preenchimentos), com
-- `nome` batendo com o valor do enum -- e o ADMINISTRADOR cria o setor
-- novo através da função criar_setor() abaixo, que ACRESCENTA o valor no
-- enum (ALTER TYPE ... ADD VALUE) e insere a linha de config aqui, nessa
-- ordem, na mesma operação.
create table setores (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  pagador_padrao_id uuid references pagadores(id),
  criado_em timestamptz not null default now(),
  criado_por uuid references usuarios(id)
);

comment on table setores is
  'Config por departamento (setor_tipo) -- pré-preenchimentos como o pagador padrão sugerido no formulário de recebimento (ver pagadorPadraoParaSetor em state.js). O enum setor_tipo continua sendo quem de fato restringe usuarios.setor/notas.setor/caixinhas.setor -- esta tabela só guarda config extra, não substitui o enum.';

alter table setores enable row level security;

-- Leitura: qualquer autenticado (o combo de "Setor" no formulário de nota
-- pra quem não tem setor fixo, e o pré-preenchimento do recebedor,
-- precisam ler isso independente do role).
create policy "setores: leitura" on setores for select
  using (auth.role() = 'authenticated');

-- Escrita: só administrador -- mesmo padrão de outros cadastros restritos
-- (ver eh_administrador() em 0013_stats_armazenamento.sql).
create policy "setores: escrita" on setores for all
  using (eh_administrador())
  with check (eh_administrador());

-- Seed: os 3 setores que já existiam no enum, com o pré-preenchimento que
-- já estava fixo no JS (Operações -> Condomínio, Marketing -> FPP,
-- Financeiro -> Consórcio) -- sem isso, o comportamento de quem já usa o
-- sistema mudaria (perderia o pré-preenchimento) só por causa desta
-- migration.
insert into setores (nome, pagador_padrao_id)
select 'Operações', (select id from pagadores where nome = 'Condomínio')
where not exists (select 1 from setores where nome = 'Operações');
insert into setores (nome, pagador_padrao_id)
select 'Marketing', (select id from pagadores where nome = 'FPP')
where not exists (select 1 from setores where nome = 'Marketing');
insert into setores (nome, pagador_padrao_id)
select 'Financeiro', (select id from pagadores where nome = 'Consórcio')
where not exists (select 1 from setores where nome = 'Financeiro');

-- RPC: cria um departamento de verdade -- só administrador (checado aqui
-- dentro, não só via RLS da tabela setores, porque o ALTER TYPE não passa
-- por RLS nenhuma). ALTER TYPE ... ADD VALUE dentro de uma função/
-- transação é permitido desde o Postgres 12, contanto que o valor novo
-- não seja USADO na mesma transação -- aqui só inserimos a linha de
-- config em seguida, sem comparar/filtrar por ele, então é seguro.
create or replace function criar_setor(p_nome text, p_pagador_padrao_id uuid)
returns setores
language plpgsql security definer
set search_path = public
as $$
declare
  novo setores;
begin
  if (select role from usuario_atual()) <> 'administrador' then
    raise exception 'Só administrador pode criar um novo departamento.';
  end if;
  if p_nome is null or trim(p_nome) = '' then
    raise exception 'Informe o nome do departamento.';
  end if;
  execute format('alter type setor_tipo add value if not exists %L', trim(p_nome));
  insert into setores (nome, pagador_padrao_id, criado_por)
  values (trim(p_nome), p_pagador_padrao_id, (select id from usuario_atual()))
  returning * into novo;
  return novo;
end;
$$;
