-- Central CP — migration 0003: usuarios, delegacoes, funções de papel/delegação
-- Parte da sequência em supabase/migrations/ — aplique em ordem numérica
-- num banco novo (ver README.md, seção "Como colocar para rodar").

-- ---------------------------------------------------------------------
-- USUÁRIOS — perfil de aplicação ligado ao Supabase Auth (auth.users)
-- ---------------------------------------------------------------------
create table usuarios (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  nome text not null,
  role user_role not null,
  setor setor_tipo, -- obrigatório para 'departamento'; nulo para os papéis globais
  email text, -- preenchido pela Edge Function de convite (client não lê auth.users)
  ativo boolean not null default true, -- desativado = trancado de tudo (ver usuario_atual())
  criado_em timestamptz not null default now(),
  constraint setor_obrigatorio_exceto_cap check (
    (role in ('contas_a_pagar', 'gerente_financeiro', 'administrador')) or (setor is not null)
  )
);

-- Função auxiliar: retorna a linha de `usuarios` do usuário autenticado atual
-- — só se estiver ativo, o que barra usuário desativado em toda policy que
-- depende dela de uma vez só, sem precisar repetir a checagem em cada uma.
create or replace function usuario_atual()
returns usuarios
language sql security definer stable
set search_path = public
as $$
  select * from usuarios where auth_user_id = auth.uid() and ativo = true;
$$;

-- ---------------------------------------------------------------------
-- DELEGAÇÕES — cobre férias/ausência: enquanto ativa e dentro do período,
-- o delegado assume as permissões do titular (papel global do titular +
-- identidade dele pra notas onde ele é o dono). Só administrador ou
-- gerente_financeiro criam/gerenciam uma delegação.
-- ---------------------------------------------------------------------
create table delegacoes (
  id uuid primary key default gen_random_uuid(),
  titular_id uuid not null references usuarios(id),
  delegado_id uuid not null references usuarios(id),
  data_inicio date not null,
  data_fim date not null,
  ativo boolean not null default true,
  motivo text,
  criado_por uuid not null references usuarios(id),
  criado_em timestamptz not null default now(),
  constraint delegado_diferente_titular check (delegado_id <> titular_id),
  constraint periodo_valido check (data_fim >= data_inicio)
);
create index idx_delegacoes_delegado on delegacoes(delegado_id);
create index idx_delegacoes_titular on delegacoes(titular_id);

-- Papéis que o usuário atual pode exercer agora: o próprio + o de qualquer
-- titular que tenha uma delegação ativa e dentro do período pra ele.
create or replace function papeis_efetivos()
returns user_role[]
language sql security definer stable
set search_path = public
as $$
  select coalesce(array_agg(distinct r), '{}')
  from (
    select role as r from usuarios where id = (select id from usuario_atual())
    union
    select u.role as r
    from delegacoes d
    join usuarios u on u.id = d.titular_id
    where d.delegado_id = (select id from usuario_atual())
      and d.ativo
      and current_date between d.data_inicio and d.data_fim
      and u.ativo
  ) x;
$$;

-- Pra checagens por identidade (ex: dono da nota), não por papel: o
-- usuário atual pode agir "como" um titular específico se for ele mesmo
-- ou se tiver uma delegação ativa dele.
create or replace function pode_agir_como(titular uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select titular = (select id from usuario_atual())
    or exists (
      select 1 from delegacoes d
      where d.delegado_id = (select id from usuario_atual())
        and d.titular_id = titular
        and d.ativo
        and current_date between d.data_inicio and d.data_fim
    );
$$;

create or replace function eh_super_usuario()
returns boolean
language sql stable
set search_path = public
as $$
  select papeis_efetivos() && array['administrador','gerente_financeiro']::user_role[];
$$;

create or replace function eh_operador_cadastro()
returns boolean
language sql stable
set search_path = public
as $$
  select eh_super_usuario() or 'contas_a_pagar' = ANY(papeis_efetivos());
$$;

-- Só administrador muda role/setor/ativo/email de um usuário. RLS é por
-- linha, não por coluna — quem garante isso de verdade é este trigger, não
-- a policy de update (que continua liberando o próprio usuário editar
-- coisas básicas do próprio perfil, tipo nome).
create or replace function bloquear_auto_promocao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Edge Function "convidar-usuario" roda com service_role (ignora RLS mas
  -- NÃO ignora trigger) — sem isso, ela nunca conseguiria desativar/reativar
  -- ninguém, incluindo a si mesma no bootstrap.
  if auth.role() = 'service_role' then
    return new;
  end if;
  if (select role from usuario_atual()) is distinct from 'administrador' then
    if new.role is distinct from old.role
       or new.setor is distinct from old.setor
       or new.ativo is distinct from old.ativo
       or new.email is distinct from old.email then
      raise exception 'Só um administrador pode alterar role, setor, e-mail ou status ativo de um usuário.';
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_bloquear_auto_promocao
  before update on usuarios
  for each row execute function bloquear_auto_promocao();
