-- supabase/migrations/0026_caixinha_teto_so_super_usuario.sql
--
-- Ajuste pedido pelo dono do produto: editar/cadastrar caixinha (nome e
-- valor-teto) fica restrito a gerente_financeiro/administrador -- NÃO é
-- mais igual ao resto dos cadastros (que também liberam contas_a_pagar,
-- ver eh_operador_cadastro()). Registrar saída/reforço continua igual pra
-- todo mundo (departamento, contas_a_pagar, gerente_financeiro,
-- administrador) -- só o cadastro da caixinha em si (nome/teto) que muda.
drop policy if exists "caixinhas: escrita" on caixinhas;
create policy "caixinhas: escrita" on caixinhas for all
  using (eh_super_usuario()) with check (eh_super_usuario());
