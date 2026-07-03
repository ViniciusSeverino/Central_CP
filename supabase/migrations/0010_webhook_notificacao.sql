-- Central CP — migration 0010: extensão pg_net + trigger de e-mail por movimentação
-- Parte da sequência em supabase/migrations/ — aplique em ordem numérica
-- num banco novo (ver README.md, seção "Como colocar para rodar").

-- =====================================================================
-- WEBHOOK: alerta por e-mail a cada movimentação
-- =====================================================================
-- Toda vez que uma linha nova entra em nota_historico (ou seja, toda
-- movimentação de qualquer nota), esse trigger chama a Edge Function
-- "notificar-movimentacao" via pg_net (assíncrono — não trava a escrita
-- da nota se o e-mail demorar ou falhar). A função decide quem é o
-- responsável pela etapa ATUAL da nota e manda o e-mail via Resend.
--
-- Troque a URL e a anon key abaixo se for configurar em outro projeto —
-- os valores aqui são os do projeto de produção (a anon key é pública
-- por design, mesma que já vai em src/js/config.js).
-- Fica em `public` de propósito, não por descuido: pg_net não é
-- relocatable (testado — "ALTER EXTENSION pg_net SET SCHEMA" é recusado
-- pelo Postgres) e sempre cria seus próprios objetos (net.http_post etc.)
-- no schema fixo `net`, então mover o registro da extensão não muda nada
-- na prática — só valeria a pena via um drop+recreate, o que arrisca
-- derrubar o webhook de e-mail em produção por um lint organizacional.
create extension if not exists pg_net;

create or replace function notificar_movimentacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Importação em lote de histórico: não manda e-mail — senão importar
  -- anos de notas antigas vira um spam pra todo mundo de uma vez.
  if new.origem = 'importacao_historica' then
    return new;
  end if;
  perform net.http_post(
    url := 'https://ofzqboxmlfogstpjaxdq.supabase.co/functions/v1/notificar-movimentacao',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9menFib3htbGZvZ3N0cGpheGRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNjY4MTUsImV4cCI6MjA5Nzc0MjgxNX0.li2PLlz0eE68WhenrX4DE5WhZR4tw814VOgHRD2PF2w'
    ),
    body := jsonb_build_object('historico_id', new.id)
  );
  return new;
end;
$$;

create trigger trg_notificar_movimentacao
  after insert on nota_historico
  for each row execute function notificar_movimentacao();
