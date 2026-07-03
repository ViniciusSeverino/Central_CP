-- Central CP — migration 0011: bucket e policies de anexos das notas
-- Parte da sequência em supabase/migrations/ — aplique em ordem numérica
-- num banco novo (ver README.md, seção "Como colocar para rodar").

-- =====================================================================
-- STORAGE: anexos das notas (PDF/boleto)
-- =====================================================================
-- Bucket privado — antes o campo "anexos" só guardava um nome de arquivo
-- digitado, o documento em si circulava por fora do sistema. Path de cada
-- objeto: "{nota_id}/{timestamp}-{nome}" — o primeiro segmento do caminho
-- é o nota_id, e as policies abaixo espelham a mesma regra de
-- visibilidade de "notas: select": quem pode ver a nota pode ler/anexar/
-- remover os arquivos dela.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'anexos-notas', 'anexos-notas', false, 15728640,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

create policy "anexos-notas: select" on storage.objects for select
  using (
    bucket_id = 'anexos-notas'
    and exists (
      select 1 from notas n
      where n.id::text = (storage.foldername(name))[1]
      and (
        eh_super_usuario()
        or ('departamento' = ANY(papeis_efetivos()) and pode_agir_como(n.criado_por))
        or ('contas_a_pagar' = ANY(papeis_efetivos()) and n.status <> 'rascunho')
      )
    )
  );

create policy "anexos-notas: insert" on storage.objects for insert
  with check (
    bucket_id = 'anexos-notas'
    and exists (
      select 1 from notas n
      where n.id::text = (storage.foldername(name))[1]
      and (
        eh_super_usuario()
        or ('departamento' = ANY(papeis_efetivos()) and pode_agir_como(n.criado_por))
        or ('contas_a_pagar' = ANY(papeis_efetivos()) and n.status <> 'rascunho')
      )
    )
  );

create policy "anexos-notas: delete" on storage.objects for delete
  using (
    bucket_id = 'anexos-notas'
    and exists (
      select 1 from notas n
      where n.id::text = (storage.foldername(name))[1]
      and (
        eh_super_usuario()
        or ('departamento' = ANY(papeis_efetivos()) and pode_agir_como(n.criado_por))
        or ('contas_a_pagar' = ANY(papeis_efetivos()) and n.status <> 'rascunho')
      )
    )
  );
