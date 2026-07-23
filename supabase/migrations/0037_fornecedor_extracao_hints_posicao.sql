-- Central CP — migration 0037: posição visual das dicas de extração
-- Parte da sequência em supabase/migrations/ — aplique em ordem numérica
-- num banco novo (ver README.md, seção "Como colocar para rodar").
--
-- Complemento à âncora de texto (migration 0020): além de responder "qual
-- é o valor", a pessoa pode desenhar um retângulo sobre a pré-visualização
-- do documento marcando ONDE aquele campo fica na página. Isso é guardado
-- como fração da página/imagem (0 a 1), não pixels absolutos, pra tolerar
-- pequenas variações de escala/resolução entre documentos do mesmo
-- fornecedor -- ver extracao_posicional.js. Todas as colunas são opcionais:
-- um hint pode ter só âncora de texto, só posição, ou os dois (posição é
-- tentada primeiro; âncora de texto continua como plano B).

alter table fornecedor_extracao_hints
  add column pagina integer,
  add column pos_x numeric,
  add column pos_y numeric,
  add column pos_largura numeric,
  add column pos_altura numeric;

alter table fornecedor_extracao_hints
  add constraint fornecedor_extracao_hints_pos_fracao_check check (
    (pos_x is null or (pos_x >= 0 and pos_x <= 1)) and
    (pos_y is null or (pos_y >= 0 and pos_y <= 1)) and
    (pos_largura is null or (pos_largura >= 0 and pos_largura <= 1)) and
    (pos_altura is null or (pos_altura >= 0 and pos_altura <= 1))
  );
