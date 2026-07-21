-- Central CP — migration 0030: pré-cadastro de fornecedor pelo departamento
-- Parte da sequência em supabase/migrations/ — aplique em ordem numérica
-- num banco novo (ver README.md, seção "Como colocar para rodar").
--
-- Problema do dono do produto: ao lançar uma nota, se o fornecedor não
-- existe ainda no sistema, quem lança (só o perfil "completo" do
-- departamento, ver migration 0029 — não o recebedor) precisa poder
-- pré-cadastrar ali mesmo (nome + CNPJ + documento pro Group), sem
-- travar o lançamento da nota. O CP revisa depois numa aba própria
-- ("Cadastrar fornecedor"), completa o resto (contas bancárias, contrato
-- etc.) e só aí o fornecedor conta como cadastrado de verdade no Group —
-- enquanto isso, notas desse fornecedor ficam fora da fila "Lançar no
-- Group" (não tem código de Group pra apontar ainda).

alter table fornecedores add column status text not null default 'ativo'
  check (status in ('ativo', 'pre_cadastro'));
alter table fornecedores add column documentos_pre_cadastro text[] not null default '{}';
alter table fornecedores add column pre_cadastrado_por uuid references usuarios(id);

comment on column fornecedores.status is
  'pre_cadastro: criado pelo departamento (perfil completo) direto no formulário de nota, só com nome/CNPJ + documento -- ainda não tem cadastro de verdade no Group. Vira "ativo" quando o CP revisa/completa (ver db.atualizarFornecedor -- toda edição de fornecedor promove pra ativo). Notas desse fornecedor ficam fora da fila "Lançar no Group" enquanto pre_cadastro (ver queueData(''lancar_group'') em ui.js).';

-- INSERT: departamento (perfil completo) pode criar um fornecedor, mas só
-- como pré-cadastro -- quem completa/ativa de verdade continua sendo só
-- quem opera cadastro (ver policy "fornecedores: escrita" já existente,
-- inalterada).
create policy "fornecedores: pre-cadastro pelo departamento completo" on fornecedores for insert
  with check (
    (select role from usuario_atual()) = 'departamento'
    and (select perfil_departamento from usuario_atual()) = 'completo'
    and status = 'pre_cadastro'
  );

-- STORAGE: documento(s) do pré-cadastro (contrato social, cartão CNPJ
-- etc. -- o que o Group pede pra cadastrar o fornecedor), separado do
-- anexo da nota. Path = "{fornecedorId}/{timestamp}-{nome}", mesmo padrão
-- de anexos-notas (0011_storage_anexos.sql). Leitura aberta a qualquer
-- autenticado (documento de cadastro de fornecedor não é sensível do
-- jeito que uma nota financeira é -- mesmo espírito de "fornecedores:
-- leitura"); só quem pode inserir o fornecedor insere o documento, e só
-- quem opera cadastro remove.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos-fornecedor', 'documentos-fornecedor', false, 15728640,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

create policy "documentos-fornecedor: select" on storage.objects for select
  using (bucket_id = 'documentos-fornecedor' and auth.role() = 'authenticated');

create policy "documentos-fornecedor: insert" on storage.objects for insert
  with check (
    bucket_id = 'documentos-fornecedor'
    and (
      eh_operador_cadastro()
      or (
        (select role from usuario_atual()) = 'departamento'
        and (select perfil_departamento from usuario_atual()) = 'completo'
      )
    )
  );

create policy "documentos-fornecedor: delete" on storage.objects for delete
  using (bucket_id = 'documentos-fornecedor' and eh_operador_cadastro());
