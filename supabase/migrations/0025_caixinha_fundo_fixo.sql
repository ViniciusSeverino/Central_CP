-- supabase/migrations/0025_caixinha_fundo_fixo.sql
--
-- Caixinha (fundo fixo / imprest): cada entidade (Consórcio, Vértico,
-- Fundo, ...) tem um valor-teto CONFIGURÁVEL (o dono do produto pediu
-- explicitamente que não fosse um valor fixo no código). Toda retirada
-- (saída) e toda reposição (reforço) vira uma movimentação registrada.
--
-- Decisões explícitas do dono do produto:
--  - TODA movimentação (saída ou reforço), de QUALQUER valor, precisa de
--    aprovação do gerente_financeiro/administrador -- não existe alçada
--    por valor aqui (diferente de notas). Quando quem registra já é
--    administrador/gerente_financeiro (autoridade de aprovação), a
--    movimentação nasce aprovada direto -- mesma lógica de
--    statusInicialParaValor()/eh_super_usuario() já usada em notas.
--  - Reforço é um registro manual, independente do fluxo de notas -- só
--    documenta de onde veio o dinheiro, não precisa corresponder a uma
--    nota lançada no Central CP.
--  - departamento e contas_a_pagar também registram (saída e reforço),
--    além de administrador/gerente_financeiro (acesso total, como em
--    todo o resto do sistema).

create type caixinha_movimentacao_tipo as enum ('saida', 'reforco');
create type caixinha_movimentacao_status as enum ('pendente_aprovacao', 'aprovado', 'rejeitado');

create table caixinhas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  valor_teto numeric(14,2) not null check (valor_teto > 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table caixinha_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  caixinha_id uuid not null references caixinhas(id),
  tipo caixinha_movimentacao_tipo not null,
  valor numeric(14,2) not null check (valor > 0),
  data date not null,
  motivo text not null,
  comprovante text, -- path no Storage (bucket comprovantes-caixinha), opcional

  status caixinha_movimentacao_status not null default 'pendente_aprovacao',
  criado_por uuid not null references usuarios(id),
  criado_em timestamptz not null default now(),

  aprovado_por uuid references usuarios(id),
  aprovado_em timestamptz,
  motivo_rejeicao text
);

create index idx_caixinha_movimentacoes_caixinha on caixinha_movimentacoes(caixinha_id);
create index idx_caixinha_movimentacoes_status on caixinha_movimentacoes(status);
create index idx_caixinha_movimentacoes_criado_por on caixinha_movimentacoes(criado_por);

alter table caixinhas enable row level security;
alter table caixinha_movimentacoes enable row level security;

-- Cadastro (nome/teto): mesma régua de quem já cuida de
-- fornecedores/pagadores/centros de custo (eh_operador_cadastro() =
-- contas_a_pagar/gerente_financeiro/administrador). Leitura liberada pra
-- todo mundo (departamento também precisa ver teto/saldo pra registrar
-- uma saída/reforço).
create policy "caixinhas: leitura" on caixinhas for select using (auth.role() = 'authenticated');
create policy "caixinhas: escrita" on caixinhas for all
  using (eh_operador_cadastro()) with check (eh_operador_cadastro());

-- Movimentações: qualquer perfil ativo participa (registra e visualiza as
-- de todo mundo -- mesma transparência de "Todas as notas"), mas só
-- administrador/gerente_financeiro aprovam/rejeitam.
create policy "caixinha_movimentacoes: leitura" on caixinha_movimentacoes for select
  using (auth.role() = 'authenticated');

-- INSERT: quem registra só pode nascer com o status que faz sentido pro
-- próprio papel -- super_usuario (autoridade de aprovação) já nasce
-- aprovado; os demais nascem pendente_aprovacao. Sem isso alguém sem
-- autoridade poderia forjar o próprio registro já "aprovado".
create policy "caixinha_movimentacoes: insert" on caixinha_movimentacoes for insert
  with check (
    criado_por = (select id from usuario_atual())
    and (
      (eh_super_usuario() and status = 'aprovado')
      or (not eh_super_usuario() and status = 'pendente_aprovacao')
    )
  );

-- Aprovar/rejeitar: só quem tem autoridade de aprovação, só em cima de
-- pendente, só pros dois destinos válidos.
create policy "caixinha_movimentacoes: update" on caixinha_movimentacoes for update
  using (eh_super_usuario() and status = 'pendente_aprovacao')
  with check (eh_super_usuario() and status in ('aprovado', 'rejeitado'));

-- Excluir: quem registrou pode cancelar o próprio pedido ainda pendente
-- (arrependimento antes de ir pra aprovação); administrador pode excluir
-- em qualquer status, mesma exceção deliberada que já vale pra notas (ver
-- 0023_admin_exclui_qualquer_etapa.sql).
create policy "caixinha_movimentacoes: delete" on caixinha_movimentacoes for delete
  using (
    (criado_por = (select id from usuario_atual()) and status = 'pendente_aprovacao')
    or ('administrador' = ANY(papeis_efetivos()))
  );

-- =====================================================================
-- STORAGE: comprovante da movimentação (opcional)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprovantes-caixinha', 'comprovantes-caixinha', false, 15728640,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

create policy "comprovantes-caixinha: select" on storage.objects for select
  using (bucket_id = 'comprovantes-caixinha' and auth.role() = 'authenticated');
create policy "comprovantes-caixinha: insert" on storage.objects for insert
  with check (bucket_id = 'comprovantes-caixinha' and auth.role() = 'authenticated');
create policy "comprovantes-caixinha: delete" on storage.objects for delete
  using (bucket_id = 'comprovantes-caixinha' and auth.role() = 'authenticated');

-- Seed inicial das 3 caixinhas pedidas -- teto de partida em R$1,00 (valor
-- "placeholder", só pra satisfazer o check valor_teto > 0); o dono do
-- produto disse que quer o teto configurável, então o valor real de cada
-- uma se ajusta depois direto na tela (Caixinha -> Editar teto).
insert into caixinhas (nome, valor_teto) values
  ('Consórcio', 1),
  ('Vértico', 1),
  ('Fundo', 1);
