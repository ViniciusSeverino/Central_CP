-- supabase/migrations/0047_documentos_pre_cadastro_fornecedor_salva.sql
--
-- Achado numa auditoria pedida pelo dono do produto em tudo que envolve
-- anexo, depois do bug do comprovante da caixinha (0046) -- mesma causa
-- raiz, num terceiro lugar: db.preCadastrarFornecedor() (fluxo do
-- departamento "completo" pré-cadastrando um fornecedor direto no
-- formulário de nota, ver migration 0030) faz, nessa ordem:
--   1. insert em fornecedores (status='pre_cadastro') -- a policy de
--      insert de 0030 libera isso pro departamento completo, funciona.
--   2. upload do(s) documento(s) pro bucket documentos-fornecedor -- a
--      policy do bucket também já libera esse role, funciona.
--   3. update fornecedores set documentos_pre_cadastro = <caminhos> --
--      SEM nenhuma policy de UPDATE que cubra departamento aqui: a única
--      policy de escrita em `fornecedores` (0007, "fornecedores:
--      escrita", FOR ALL) exige eh_operador_cadastro() (contas_a_pagar/
--      gerente_financeiro/administrador) -- departamento nunca foi
--      incluído, porque 0030 só pensou em INSERT. Esse UPDATE final
--      esbarra na RLS, filtra a linha (0 linhas afetadas, sem erro) -- o
--      documento fica órfão no Storage e a coluna documentos_pre_cadastro
--      nunca é preenchida. O CP então vê o pré-cadastro na fila
--      "Cadastrar fornecedor" com "Nenhum documento anexado", mesmo
--      quando o departamento anexou um -- reproduz 100% das vezes (é o
--      único role que passa por este código, ver renderFornecedorPreCadastroArea
--      em ui_nota.js, só aparece pro departamento completo).
--
-- Correção: nova policy de UPDATE restrita ao próprio criador do
-- pré-cadastro, só enquanto o status ainda for 'pre_cadastro' nos dois
-- lados (using E with check) -- não abre brecha pra ele mesmo promover o
-- fornecedor a 'ativo' (isso continua exclusivo de eh_operador_cadastro,
-- via "fornecedores: escrita", que fica intocada).
create policy "fornecedores: departamento completo atualiza o próprio pre-cadastro" on fornecedores for update
  using (
    (select role from usuario_atual()) = 'departamento'
    and (select perfil_departamento from usuario_atual()) = 'completo'
    and pre_cadastrado_por = (select id from usuario_atual())
    and status = 'pre_cadastro'
  )
  with check (
    (select role from usuario_atual()) = 'departamento'
    and (select perfil_departamento from usuario_atual()) = 'completo'
    and pre_cadastrado_por = (select id from usuario_atual())
    and status = 'pre_cadastro'
  );
