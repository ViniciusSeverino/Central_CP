-- Central CP — migration 0062: avaliação do leitor por nota (aba Treinamento)
--
-- A aba Treinamento do leitor (0061) passa a listar só as notas em que o
-- leitor DIVERGE do que foi lançado. Saber isso exige ler o anexo de cada
-- nota no navegador do administrador (PDF digital < 1 s, escaneado 10-17 s),
-- então o resultado fica guardado aqui -- só a primeira avaliação é longa.
-- Uma avaliação vence quando alguma dica do fornecedor da nota é salva
-- depois dela (fornecedor_extracao_hints.atualizado_em > avaliado_em); a
-- aba reavalia essas notas sozinha (ver events_treinamento.js).
--
-- campos: { <campo>: { ok: true|false|null, lido } } para numeroNota,
-- valor, cnpj/cpf e dataEmissao (o vencimento do boleto não tem gabarito).
-- Só administrador, como ocr_treinamento_notas.

create table if not exists ocr_avaliacao_notas (
  nota_id uuid primary key references notas(id) on delete cascade,
  campos jsonb not null default '{}'::jsonb,
  fonte text,
  avaliado_em timestamptz not null default now()
);
alter table ocr_avaliacao_notas enable row level security;
drop policy if exists "ocr_avaliacao_notas: admin" on ocr_avaliacao_notas;
create policy "ocr_avaliacao_notas: admin" on ocr_avaliacao_notas for all
  using ((select eh_administrador())) with check ((select eh_administrador()));
