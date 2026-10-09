-- Central CP — migration 0061: treinamento do leitor de documentos (OCR)
--
-- 1) Posição das dicas de extração (o conteúdo da 0037, que NUNCA chegou
--    a ser aplicado na produção -- e por isso todo "ensinar o leitor" /
--    captura por retângulo falhava ao gravar: db.salvarExtracaoHint já
--    mandava pagina/pos_*). Idempotente: "if not exists".
-- 2) tipo_pagina: o TIPO da página onde o campo foi indicado (nota_fiscal,
--    boleto, comprovante_pagamento, outro) -- o PDF final de cada nota
--    junta nota/boleto/comprovante em ordem que muda de nota pra nota, então
--    "página 2" não serve sozinho; o leitor procura a região primeiro nas
--    páginas desse tipo (ver aplicarHintsDePosicao em extracao_posicional.js).
-- 3) campo passa a aceitar dataEmissao e vencimento (aba Treinamento).
-- 4) ocr_treinamento_notas: quais notas o administrador já treinou (e o
--    tipo de cada página que ele marcou). Só administrador (por enquanto é
--    uma ferramenta só dele, como o DRE).

alter table fornecedor_extracao_hints
  add column if not exists pagina integer,
  add column if not exists pos_x numeric,
  add column if not exists pos_y numeric,
  add column if not exists pos_largura numeric,
  add column if not exists pos_altura numeric,
  add column if not exists tipo_pagina text;

alter table fornecedor_extracao_hints drop constraint if exists fornecedor_extracao_hints_pos_fracao_check;
alter table fornecedor_extracao_hints
  add constraint fornecedor_extracao_hints_pos_fracao_check check (
    (pos_x is null or (pos_x >= 0 and pos_x <= 1)) and
    (pos_y is null or (pos_y >= 0 and pos_y <= 1)) and
    (pos_largura is null or (pos_largura >= 0 and pos_largura <= 1)) and
    (pos_altura is null or (pos_altura >= 0 and pos_altura <= 1))
  );

alter table fornecedor_extracao_hints drop constraint if exists fornecedor_extracao_hints_campo_check;
alter table fornecedor_extracao_hints
  add constraint fornecedor_extracao_hints_campo_check
  check (campo in ('numeroNota', 'valor', 'cnpj', 'cpf', 'data', 'dataEmissao', 'vencimento', 'tipo'));

create table if not exists ocr_treinamento_notas (
  nota_id uuid primary key references notas(id) on delete cascade,
  tipos_pagina jsonb not null default '{}'::jsonb,
  treinado_em timestamptz not null default now(),
  treinado_por uuid references usuarios(id)
);
alter table ocr_treinamento_notas enable row level security;
drop policy if exists "ocr_treinamento_notas: admin" on ocr_treinamento_notas;
create policy "ocr_treinamento_notas: admin" on ocr_treinamento_notas for all
  using ((select eh_administrador())) with check ((select eh_administrador()));
