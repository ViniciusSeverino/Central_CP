-- Central CP — migration 0033: parcelamento de nota
-- Parte da sequência em supabase/migrations/ — aplique em ordem numérica
-- num banco novo (ver README.md, seção "Como colocar para rodar").
--
-- Pedido do dono do produto: pagamento parcelado, gerando linhas
-- separadas por parcela -- "semelhante ao rateio" na TELA de lançamento
-- (uma tabela editável, ver renderParcelamentoArea em ui_nota.js), mas
-- diferente do rateio no MODELO de dados: rateio divide o valor de uma
-- nota entre classificações e a nota continua sendo uma coisa só (um
-- vencimento, uma aprovação, um lançamento no Group, um pagamento).
-- Parcelamento divide o VENCIMENTO -- cada parcela pode estar numa etapa
-- diferente da esteira ao mesmo tempo (parcela 1/3 já paga, 2/3 ainda em
-- aprovação), então cada parcela precisa ser uma NOTA própria, com seu
-- próprio ciclo de vida completo. Estas colunas só ligam as parcelas
-- entre si pra rastreio/relatório -- nenhuma policy de RLS precisa saber
-- que existem (o INSERT/UPDATE continua sendo por nota individual, exatamente
-- como já era).
alter table notas add column parcelamento_id uuid;
alter table notas add column parcela_numero smallint;
alter table notas add column parcela_total smallint;

comment on column notas.parcelamento_id is
  'Agrupa as notas geradas por um mesmo lançamento parcelado (ver events_notas.js, btn-salvar-nota, ramo p.tem_parcelamento) -- só rastreio, gerado no cliente (uid()), sem nenhum efeito em RLS ou no fluxo de aprovação de cada parcela, que segue 100% independente.';

create index if not exists idx_notas_parcelamento_id on notas(parcelamento_id) where parcelamento_id is not null;
