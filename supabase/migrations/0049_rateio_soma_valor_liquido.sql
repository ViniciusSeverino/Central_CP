-- supabase/migrations/0049_rateio_soma_valor_liquido.sql
--
-- Corrige uma inconsistência real entre o formulário e o banco: desde a
-- decisão do dono do produto de que o rateio divide o valor LÍQUIDO da
-- nota (o que de fato é pago ao fornecedor, não o bruto -- ver comentário
-- em ui_nota.js/valorBaseRateio), o formulário trava o usuário nesse
-- limite. Mas o trigger de segurança do banco (validar_soma_rateio_de,
-- 0009_rls_rateios_historico.sql) nunca foi atualizado -- continuava
-- exigindo que a soma do rateio batesse com o valor BRUTO. Resultado: pra
-- qualquer nota com rateio + retenção de imposto, o formulário só deixa
-- ratear até o líquido, e o banco exige que a soma seja o bruto -- as
-- duas regras nunca podiam ser satisfeitas ao mesmo tempo. Auditoria
-- encontrou 17 notas em produção onde a soma do rateio ficou igual ao
-- bruto (não ao líquido) -- essas notas ficam como estão (histórico), só
-- lançamentos novos passam a seguir a regra corrigida.
create or replace function validar_soma_rateio_de(p_nota_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  soma numeric;
  base numeric;
  tem_rat boolean;
begin
  select coalesce(valor_liquido, valor_bruto), tem_rateio into base, tem_rat from notas where id = p_nota_id;
  if tem_rat then
    select coalesce(sum(valor), 0) into soma from nota_rateios where nota_id = p_nota_id;
    if soma > 0 and abs(soma - base) > 0.01 then
      raise exception 'A soma do rateio (%) precisa ser igual ao valor líquido da nota (%).', soma, base;
    end if;
  end if;
end;
$$;
