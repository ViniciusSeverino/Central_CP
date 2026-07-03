-- Central CP — migration 0001: extensões do Postgres (pgcrypto, pg_trgm)
-- Parte da sequência em supabase/migrations/ — aplique em ordem numérica
-- num banco novo (ver README.md, seção "Como colocar para rodar").

create extension if not exists "pgcrypto";
-- Instalada no schema `extensions` (convenção do Supabase) em vez de
-- `public` — mais organizado e reduz a superfície de objetos soltos no
-- schema público. É relocatable, então não afeta o índice gin que usa
-- gin_trgm_ops lá embaixo (ele referencia a operator class pelo OID
-- interno, não pelo nome do schema).
create extension if not exists pg_trgm with schema extensions;
