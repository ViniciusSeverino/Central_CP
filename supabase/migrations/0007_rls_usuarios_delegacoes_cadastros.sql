-- Central CP — migration 0007: policies de usuarios/delegacoes/cadastros
-- Parte da sequência em supabase/migrations/ — aplique em ordem numérica
-- num banco novo (ver README.md, seção "Como colocar para rodar").

-- ---------------------------------------------------------------------
-- USUARIOS: qualquer autenticado lê todo mundo (precisa pra mostrar nome
-- de quem criou/aprovou). Cadastro FECHADO — não existe policy de insert
-- de propósito, então ninguém insere via client; só a Edge Function
-- "convidar-usuario", que roda com service_role (ignora RLS). Update:
-- o próprio usuário edita dados básicos do próprio perfil (nome), e
-- administrador edita qualquer um — mas quem muda role/setor/ativo/email
-- de verdade é o trigger bloquear_auto_promocao() lá em cima, não esta
-- policy (RLS não segura coluna, só linha).
-- ---------------------------------------------------------------------
create policy "usuarios: leitura geral" on usuarios for select
  using (auth.role() = 'authenticated');
create policy "usuarios: atualiza o próprio ou administrador atualiza qualquer um" on usuarios for update
  using (auth_user_id = auth.uid() or (select role from usuario_atual()) = 'administrador')
  with check (auth_user_id = auth.uid() or (select role from usuario_atual()) = 'administrador');

-- ---------------------------------------------------------------------
-- DELEGAÇÕES — cada um vê as próprias (como titular ou delegado); só
-- administrador/gerente_financeiro criam, editam ou revogam.
-- ---------------------------------------------------------------------
create policy "delegacoes: leitura" on delegacoes for select
  using (
    eh_super_usuario()
    or titular_id = (select id from usuario_atual())
    or delegado_id = (select id from usuario_atual())
  );
create policy "delegacoes: gerenciar" on delegacoes for all
  using (eh_super_usuario())
  with check (eh_super_usuario());

-- ---------------------------------------------------------------------
-- CADASTROS (pagadores, centros_custo, classes_conta, codigos_classificacao,
-- fornecedores, fornecedor_contas): leitura geral para autenticados (o
-- departamento precisa ler pra montar a nota); escrita (insert/update/
-- delete) pra quem opera cadastro — contas_a_pagar, gerente_financeiro e
-- administrador (ver eh_operador_cadastro()).
-- ---------------------------------------------------------------------
create policy "pagadores: leitura" on pagadores for select using (auth.role() = 'authenticated');
create policy "pagadores: escrita" on pagadores for all
  using (eh_operador_cadastro()) with check (eh_operador_cadastro());

create policy "centros_custo: leitura" on centros_custo for select using (auth.role() = 'authenticated');
create policy "centros_custo: escrita" on centros_custo for all
  using (eh_operador_cadastro()) with check (eh_operador_cadastro());

create policy "classes_conta: leitura" on classes_conta for select using (auth.role() = 'authenticated');
create policy "classes_conta: escrita" on classes_conta for all
  using (eh_operador_cadastro()) with check (eh_operador_cadastro());

create policy "codigos_classificacao: leitura" on codigos_classificacao for select using (auth.role() = 'authenticated');
create policy "codigos_classificacao: escrita" on codigos_classificacao for all
  using (eh_operador_cadastro()) with check (eh_operador_cadastro());

create policy "fornecedores: leitura" on fornecedores for select using (auth.role() = 'authenticated');
create policy "fornecedores: escrita" on fornecedores for all
  using (eh_operador_cadastro()) with check (eh_operador_cadastro());

create policy "fornecedor_contas: leitura" on fornecedor_contas for select using (auth.role() = 'authenticated');
create policy "fornecedor_contas: escrita" on fornecedor_contas for all
  using (eh_operador_cadastro()) with check (eh_operador_cadastro());
