-- Central CP — migration 0022: assinaturas de Web Push
-- Parte da sequência em supabase/migrations/ — aplique em ordem numérica
-- num banco novo (ver README.md, seção "Como colocar para rodar").
--
-- Alternativa ao alerta por e-mail (Resend): sem domínio verificado, o
-- remetente onboarding@resend.dev só entrega pro próprio endereço da conta
-- Resend, não pra lista nenhuma de destinatários -- trava do provedor, não
-- do Central CP. Web Push não depende de DNS nem de provedor de e-mail:
-- cada navegador logado assina por conta própria (endpoint + chaves) e o
-- Edge Function manda o push direto pro serviço do navegador (Chrome/
-- Firefox/etc), assinado com o par de chaves VAPID do projeto. O e-mail
-- continua no ar em paralelo (funciona pra quem tiver o mesmo endereço da
-- conta Resend); o push cobre todo mundo, independente de e-mail.
create table push_subscricoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now()
);
alter table push_subscricoes enable row level security;

-- Cada usuário só vê/gerencia a própria assinatura -- é o navegador dele
-- que gera o endpoint, ninguém precisa ler assinatura de outro usuário
-- pelo client. Quem lê pra mandar push de verdade é a Edge Function via
-- service_role (ignora RLS).
create policy "push_subscricoes: select própria" on push_subscricoes for select
  using (usuario_id = (select id from usuario_atual()));
create policy "push_subscricoes: insert própria" on push_subscricoes for insert
  with check (usuario_id = (select id from usuario_atual()));
create policy "push_subscricoes: update própria" on push_subscricoes for update
  using (usuario_id = (select id from usuario_atual()))
  with check (usuario_id = (select id from usuario_atual()));
create policy "push_subscricoes: delete própria" on push_subscricoes for delete
  using (usuario_id = (select id from usuario_atual()));
