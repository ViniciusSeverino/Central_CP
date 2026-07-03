-- Central CP — migration 0012: coluna de arquivamento de anexo + trigger de bloqueio
-- Parte da sequência em supabase/migrations/ — aplique em ordem numérica
-- num banco novo (ver README.md, seção "Como colocar para rodar").

-- Arquivamento de anexos (aba Cadastros → Arquivos): depois que o contas a
-- pagar baixa o .zip de um grupo (pagador + tipo de nota) e confirma que
-- salvou na rede local da empresa, os arquivos saem do Storage do Supabase
-- (limite de 1GB no plano gratuito) — mas o registro da nota continua.
-- Esta coluna só marca QUANDO isso aconteceu, pra tela de detalhe mostrar
-- "Arquivado localmente" no lugar de um link de download quebrado.
alter table notas add column anexo_arquivado_em timestamptz;

-- Só deixa arquivar (marcar essa coluna) uma nota que já tem chamado aberto
-- no Acelerato (numero_chamado preenchido) — documentos de processos ainda
-- ativos (antes dessa etapa) precisam continuar guardados no sistema.
-- Reforça no banco a mesma regra que a UI já aplica, pra não dar pra
-- contornar chamando a API direto.
create or replace function bloquear_arquivamento_sem_chamado()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.anexo_arquivado_em is not null and old.anexo_arquivado_em is null and new.numero_chamado is null then
    raise exception 'Só é possível arquivar anexos de notas que já têm chamado aberto no Acelerato.';
  end if;
  return new;
end;
$$;

create trigger trg_bloquear_arquivamento_sem_chamado
  before update on notas
  for each row execute function bloquear_arquivamento_sem_chamado();
