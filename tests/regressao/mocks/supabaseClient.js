// tests/regressao/mocks/supabaseClient.js
//
// Substitui o supabaseClient.js real durante os testes (ver sync.mjs) —
// mesma forma pública (auth/from/rpc/functions/storage), mas guarda tudo
// em memória em vez de bater num Supabase de verdade. Isso deixa a suíte
// inteira rodando sem precisar de nenhum segredo (é por isso que o CI
// consegue rodar sem configurar nada) — o preço é que ela testa a LÓGICA
// do app (permissões, fluxo, agrupamento, validação client-side), não as
// RLS/triggers do banco em si (essas são testadas à parte, ao vivo, com
// sessões simuladas contra homolog/produção — ver docs/fluxo-processo.md).
//
// As datas de delegação usam offset relativo a "hoje" (não datas fixas)
// pra nunca ficar "expirado" só porque o tempo passou.
const hoje = new Date();
const emDias = (n) => new Date(hoje.getTime() + n * 86400000).toISOString().slice(0, 10);
const agoraIso = () => new Date().toISOString();

const FIXTURES = {
  usuarios: [
    { id: 'u-dept-1', auth_user_id: 'auth-1', nome: 'Depto Teste', role: 'departamento', setor: 'Marketing', perfil_departamento: 'completo', email: 'dept@central-cp.local', ativo: true, criado_em: agoraIso() },
    { id: 'u-cp-1', auth_user_id: 'auth-cp-1', nome: 'CP Teste', role: 'contas_a_pagar', setor: null, email: 'cp@central-cp.local', ativo: true, criado_em: agoraIso() },
    { id: 'u-gerente-1', auth_user_id: 'auth-gerente-1', nome: 'Gerente Teste', role: 'gerente_financeiro', setor: null, email: 'gerente@central-cp.local', ativo: true, criado_em: agoraIso() },
    { id: 'u-admin-1', auth_user_id: 'auth-admin-1', nome: 'Admin Teste', role: 'administrador', setor: null, email: 'admin@central-cp.local', ativo: true, criado_em: agoraIso() },
    { id: 'u-dept-ferias-1', auth_user_id: 'auth-dept-ferias-1', nome: 'Depto Ferias Teste', role: 'departamento', setor: 'Financeiro', perfil_departamento: 'completo', email: 'ferias@central-cp.local', ativo: true, criado_em: agoraIso() },
    { id: 'u-dept-2', auth_user_id: 'auth-dept-2', nome: 'Depto Operacoes', role: 'departamento', setor: 'Operações', perfil_departamento: 'completo', email: 'dept2@central-cp.local', ativo: true, criado_em: agoraIso() },
    { id: 'u-inativo-1', auth_user_id: 'auth-inativo-1', nome: 'Usuario Desativado', role: 'departamento', setor: 'Marketing', perfil_departamento: 'completo', email: 'inativo@central-cp.local', ativo: false, criado_em: agoraIso() },
    // Perfil "recebedor" (ver migration 0029): mesmo setor de u-dept-1
    // (Marketing) de propósito -- os testes de recebimento usam os dois
    // pra simular "recebedor anexa" / "completo do mesmo setor completa".
    { id: 'u-dept-recebedor-1', auth_user_id: 'auth-dept-recebedor-1', nome: 'Recebedor Teste', role: 'departamento', setor: 'Marketing', perfil_departamento: 'recebedor', email: 'recebedor@central-cp.local', ativo: true, criado_em: agoraIso() },
    // Titular (gerente_financeiro) + 4 delegados (contas_a_pagar), um por
    // cenário de data (ver FIXTURES.delegacoes) -- mesmo exemplo usado na
    // seção 1.2 de docs/fluxo-processo.md ("contas a pagar cobrindo o
    // gerente financeiro também passa a aprovar"): isolados um do outro
    // pra cada teste checar exatamente um caso por vez.
    { id: 'u-titular-gerente', auth_user_id: 'auth-titular-gerente', nome: 'Titular Gerente', role: 'gerente_financeiro', setor: null, email: 'titular-gerente@central-cp.local', ativo: true, criado_em: agoraIso() },
    { id: 'u-delegado-ativa', auth_user_id: 'auth-delegado-ativa', nome: 'Delegado Ativa', role: 'contas_a_pagar', setor: null, email: 'delegado-ativa@central-cp.local', ativo: true, criado_em: agoraIso() },
    { id: 'u-delegado-futura', auth_user_id: 'auth-delegado-futura', nome: 'Delegado Futura', role: 'contas_a_pagar', setor: null, email: 'delegado-futura@central-cp.local', ativo: true, criado_em: agoraIso() },
    { id: 'u-delegado-expirada', auth_user_id: 'auth-delegado-expirada', nome: 'Delegado Expirada', role: 'contas_a_pagar', setor: null, email: 'delegado-expirada@central-cp.local', ativo: true, criado_em: agoraIso() },
    { id: 'u-delegado-revogada', auth_user_id: 'auth-delegado-revogada', nome: 'Delegado Revogada', role: 'contas_a_pagar', setor: null, email: 'delegado-revogada@central-cp.local', ativo: true, criado_em: agoraIso() },
  ],
  delegacoes: [
    { id: 'dl-ativa', titular_id: 'u-titular-gerente', delegado_id: 'u-delegado-ativa', data_inicio: emDias(-3), data_fim: emDias(3), motivo: 'férias', ativo: true, criado_por: 'u-admin-1' },
    { id: 'dl-futura', titular_id: 'u-titular-gerente', delegado_id: 'u-delegado-futura', data_inicio: emDias(5), data_fim: emDias(10), motivo: 'férias agendadas', ativo: true, criado_por: 'u-admin-1' },
    { id: 'dl-expirada', titular_id: 'u-titular-gerente', delegado_id: 'u-delegado-expirada', data_inicio: emDias(-20), data_fim: emDias(-5), motivo: 'férias passadas', ativo: true, criado_por: 'u-admin-1' },
    { id: 'dl-revogada', titular_id: 'u-titular-gerente', delegado_id: 'u-delegado-revogada', data_inicio: emDias(-3), data_fim: emDias(3), motivo: 'revogada antes do fim', ativo: false, criado_por: 'u-admin-1' },
  ],
  pagadores: [
    { id: 'pag-1', nome: 'Condomínio', sigla: 'COND' },
    { id: 'pag-2', nome: 'FPP', sigla: 'FPP' },
  ],
  centros_custo: [
    { id: 'cc-1', codigo: '2.01', nome: 'ADMINISTRATIVO', sigla: 'ADM', origem_siglas: ['COND'] },
    { id: 'cc-2', codigo: '2.02', nome: 'OPERACOES', sigla: 'OPE', origem_siglas: ['COND', 'FPP'] },
  ],
  classes_conta: [
    { id: 'cl-1', codigo: '2.01.01', nome: 'SALARIOS', centro_custo_id: 'cc-1' },
    { id: 'cl-2', codigo: '2.02.01', nome: 'MANUTENCAO', centro_custo_id: 'cc-2' },
  ],
  codigos_classificacao: [
    { id: 'co-1', codigo: '2.01.01.01', nome: 'Adiantamento', classe_conta_id: 'cl-1' },
  ],
  // fornecedor_contas fica numa tabela de verdade à parte (não embutida
  // em cada fornecedor) -- select('*, fornecedor_contas(*)') simula o
  // join de verdade (ver queryBuilder), assim insert/delete feitos por
  // atualizarFornecedor()/adicionarFornecedor() aparecem na releitura
  // igual ao Supabase real faria.
  fornecedores: Array.from({ length: 20 }).map((_, i) => ({
    id: `forn-${i}`, nome: `Fornecedor Teste ${i}`, cnpj: null, municipio: 'BAURU', cod_group: null,
    pessoa_tipo: null, tipo_contratacao_padrao: null, contrato_vigencia_inicio: null, contrato_vigencia_fim: null, contrato_observacoes: null,
    status: 'ativo', documentos_pre_cadastro: [], pre_cadastrado_por: null,
  })).concat([
    // Pré-cadastro (ver migration 0030): criado pelo departamento
    // "completo" direto no formulário de nota, aguardando o CP revisar.
    { id: 'forn-precadastro-1', nome: 'Fornecedor Pré-cadastrado Teste', cnpj: '11.111.111/0001-11', municipio: null, cod_group: null,
      pessoa_tipo: null, tipo_contratacao_padrao: null, contrato_vigencia_inicio: null, contrato_vigencia_fim: null, contrato_observacoes: null,
      status: 'pre_cadastro', documentos_pre_cadastro: ['forn-precadastro-1/123-contrato.pdf'], pre_cadastrado_por: 'u-dept-1' },
  ]),
  notas: [
    {
      id: 'nota-1', numero_nota: 'NF-1', valor_bruto: '1234.50', descricao: 'teste',
      pagador_id: 'pag-1', fornecedor_id: 'forn-0', forma_pagamento: 'Boleto bancário',
      classificacao: 'Compras', tem_rateio: false, centro_custo_id: 'cc-1', classe_conta_id: 'cl-1',
      codigo_classificacao_id: null, status: 'lancado', pendente: false, motivo_pendencia: null,
      setor: 'Marketing', criado_por: 'u-dept-1', criado_em: agoraIso(), data_emissao: '2026-06-01', vencimento: '2026-07-10', competencia: '2026-06-01',
      aprovado_por: null, data_aprovacao: null, numero_chamado: null, data_pagamento: null,
      numero_lancamento_group: null, data_lancamento_group: null, data_validacao_csc: null, validado_por: null,
      anexo_arquivado_em: null,
      anexos: [], nota_rateios: [], nota_historico: [{ id: 'h1', nota_id: 'nota-1', usuario_id: 'u-dept-1', acao: 'Nota lançada', detalhe: null, criado_em: agoraIso() }],
    },
    {
      id: 'nota-2', numero_nota: 'NF-2', valor_bruto: '500.00', descricao: 'teste2',
      pagador_id: 'pag-1', fornecedor_id: 'forn-1', forma_pagamento: 'Boleto bancário',
      classificacao: 'Compras', tem_rateio: false, centro_custo_id: 'cc-1', classe_conta_id: 'cl-1',
      codigo_classificacao_id: null, status: 'aprovado', pendente: false, motivo_pendencia: null,
      setor: 'Marketing', criado_por: 'u-dept-1', criado_em: agoraIso(), data_emissao: '2026-06-01', vencimento: '2026-07-10', competencia: '2026-06-01',
      aprovado_por: 'u-gerente-1', data_aprovacao: agoraIso(), numero_chamado: null, data_pagamento: null,
      numero_lancamento_group: null, data_lancamento_group: null, data_validacao_csc: null, validado_por: null,
      anexo_arquivado_em: null,
      anexos: [], nota_rateios: [], nota_historico: [],
    },
    {
      id: 'nota-3', numero_nota: 'NF-3', valor_bruto: '800.00', descricao: 'teste3',
      pagador_id: 'pag-1', fornecedor_id: 'forn-2', forma_pagamento: 'Boleto bancário',
      classificacao: 'Compras', tem_rateio: false, centro_custo_id: 'cc-1', classe_conta_id: 'cl-1',
      codigo_classificacao_id: null, status: 'aprovado', pendente: false, motivo_pendencia: null,
      setor: 'Marketing', criado_por: 'u-dept-1', criado_em: agoraIso(), data_emissao: '2026-06-01', vencimento: '2026-07-10', competencia: '2026-06-01',
      aprovado_por: 'u-gerente-1', data_aprovacao: agoraIso(), numero_chamado: null, data_pagamento: null,
      numero_lancamento_group: null, data_lancamento_group: null, data_validacao_csc: null, validado_por: null,
      anexo_arquivado_em: null,
      anexos: [], nota_rateios: [], nota_historico: [],
    },
    {
      id: 'nota-4', numero_nota: 'NF-4', valor_bruto: '300.00', descricao: 'pendente',
      pagador_id: 'pag-2', fornecedor_id: 'forn-3', forma_pagamento: 'Boleto bancário',
      classificacao: 'Compras', tem_rateio: false, centro_custo_id: 'cc-2', classe_conta_id: 'cl-2',
      codigo_classificacao_id: null, status: 'chamado_aberto', pendente: true, motivo_pendencia: 'CSC recusou: nota duplicada',
      setor: 'Marketing', criado_por: 'u-dept-1', criado_em: agoraIso(), data_emissao: '2026-06-20', vencimento: '2026-07-15', competencia: '2026-06-01',
      aprovado_por: 'u-gerente-1', data_aprovacao: agoraIso(), numero_chamado: 'CH-1', data_pagamento: null,
      numero_lancamento_group: 'GR-1', data_lancamento_group: agoraIso(), data_validacao_csc: null, validado_por: null,
      anexo_arquivado_em: null,
      anexos: [], nota_rateios: [], nota_historico: [],
    },
    {
      id: 'nota-5', numero_nota: 'NF-5', valor_bruto: '620.00', descricao: 'elegivel p/ arquivar',
      pagador_id: 'pag-1', fornecedor_id: 'forn-4', forma_pagamento: 'Boleto bancário',
      classificacao: 'Serviço', tem_rateio: false, centro_custo_id: 'cc-1', classe_conta_id: 'cl-1',
      codigo_classificacao_id: null, status: 'validado_csc', pendente: false, motivo_pendencia: null,
      setor: 'Marketing', criado_por: 'u-dept-1', criado_em: agoraIso(), data_emissao: '2026-05-01', vencimento: '2026-06-01', competencia: '2026-05-01',
      aprovado_por: 'u-gerente-1', data_aprovacao: agoraIso(), numero_chamado: 'CH-500', data_pagamento: null,
      numero_lancamento_group: 'GR-5', data_lancamento_group: agoraIso(), data_validacao_csc: agoraIso(), validado_por: 'u-cp-1',
      anexo_arquivado_em: null,
      anexos: ['nota-5/BSB_COND_01-06_FORNECEDOR_4_NF5_BOLETO.pdf'], nota_rateios: [], nota_historico: [],
    },
    {
      id: 'nota-6', numero_nota: 'NF-6', valor_bruto: '150.00', descricao: 'ja arquivada',
      pagador_id: 'pag-1', fornecedor_id: 'forn-4', forma_pagamento: 'Boleto bancário',
      classificacao: 'Serviço', tem_rateio: false, centro_custo_id: 'cc-1', classe_conta_id: 'cl-1',
      codigo_classificacao_id: null, status: 'pago', pendente: false, motivo_pendencia: null,
      setor: 'Marketing', criado_por: 'u-dept-1', criado_em: agoraIso(), data_emissao: '2026-04-01', vencimento: '2026-05-01', competencia: '2026-04-01',
      aprovado_por: 'u-gerente-1', data_aprovacao: agoraIso(), numero_chamado: 'CH-600', data_pagamento: '2026-05-10',
      numero_lancamento_group: 'GR-6', data_lancamento_group: agoraIso(), data_validacao_csc: agoraIso(), validado_por: 'u-cp-1',
      anexo_arquivado_em: '2026-06-15T10:00:00.000Z',
      anexos: [], nota_rateios: [], nota_historico: [],
    },
    {
      id: 'nota-7', numero_nota: 'NF-7', valor_bruto: '400.00', descricao: 'ainda ativa (sem chamado) -- nao elegivel',
      pagador_id: 'pag-1', fornecedor_id: 'forn-4', forma_pagamento: 'Boleto bancário',
      classificacao: 'Serviço', tem_rateio: false, centro_custo_id: 'cc-1', classe_conta_id: 'cl-1',
      codigo_classificacao_id: null, status: 'lancado', pendente: false, motivo_pendencia: null,
      setor: 'Marketing', criado_por: 'u-dept-1', criado_em: agoraIso(), data_emissao: '2026-06-01', vencimento: '2026-07-01', competencia: '2026-06-01',
      aprovado_por: 'u-gerente-1', data_aprovacao: agoraIso(), numero_chamado: null, data_pagamento: null,
      numero_lancamento_group: null, data_lancamento_group: null, data_validacao_csc: null, validado_por: null,
      anexo_arquivado_em: null,
      anexos: ['nota-7/BSB_COND_01-07_FORNECEDOR_4_NF7_BOLETO.pdf'], nota_rateios: [], nota_historico: [],
    },
    {
      // Rateio batendo com valor_bruto (2 linhas, soma = 900.00) -- pra
      // testar exibição/expansão de rateio em "Todas as notas".
      id: 'nota-8', numero_nota: 'NF-8', valor_bruto: '900.00', descricao: 'com rateio',
      pagador_id: 'pag-2', fornecedor_id: 'forn-5', forma_pagamento: 'Boleto bancário',
      classificacao: 'Compras', tem_rateio: true, centro_custo_id: null, classe_conta_id: null,
      codigo_classificacao_id: null, status: 'lancado', pendente: false, motivo_pendencia: null,
      setor: 'Operações', criado_por: 'u-dept-2', criado_em: agoraIso(), data_emissao: '2026-06-05', vencimento: '2026-07-05', competencia: '2026-06-01',
      aprovado_por: null, data_aprovacao: null, numero_chamado: null, data_pagamento: null,
      numero_lancamento_group: null, data_lancamento_group: null, data_validacao_csc: null, validado_por: null,
      anexo_arquivado_em: null,
      anexos: [], nota_historico: [],
      nota_rateios: [
        { id: 'rat-1', nota_id: 'nota-8', valor: '500.00', centro_custo_id: 'cc-2', classe_conta_id: 'cl-2', codigo_classificacao_id: null, descricao: 'parte 1' },
        { id: 'rat-2', nota_id: 'nota-8', valor: '400.00', centro_custo_id: 'cc-2', classe_conta_id: 'cl-2', codigo_classificacao_id: null, descricao: 'parte 2' },
      ],
    },
    {
      // Já paga -- pra testar que o botão de cancelar/excluir some (a
      // regra de verdade é o trigger no banco, isso testa só a UI).
      id: 'nota-9', numero_nota: 'NF-9', valor_bruto: '250.00', descricao: 'ja paga',
      pagador_id: 'pag-1', fornecedor_id: 'forn-6', forma_pagamento: 'PIX',
      classificacao: 'Compras', tem_rateio: false, centro_custo_id: 'cc-1', classe_conta_id: 'cl-1',
      codigo_classificacao_id: null, status: 'pago', pendente: false, motivo_pendencia: null,
      setor: 'Marketing', criado_por: 'u-dept-1', criado_em: agoraIso(), data_emissao: '2026-03-01', vencimento: '2026-04-01', competencia: '2026-03-01',
      aprovado_por: 'u-gerente-1', data_aprovacao: agoraIso(), numero_chamado: 'CH-900', data_pagamento: '2026-04-05',
      numero_lancamento_group: 'GR-9', data_lancamento_group: agoraIso(), data_validacao_csc: agoraIso(), validado_por: 'u-cp-1',
      anexo_arquivado_em: null,
      anexos: [], nota_rateios: [], nota_historico: [],
    },
    {
      // Cancelada -- pra testar exibição de status e que ela não entra em
      // nenhuma fila de ação do CP.
      id: 'nota-10', numero_nota: 'NF-10', valor_bruto: '180.00', descricao: 'cancelada',
      pagador_id: 'pag-2', fornecedor_id: 'forn-7', forma_pagamento: 'Boleto bancário',
      classificacao: 'Outros', tem_rateio: false, centro_custo_id: 'cc-2', classe_conta_id: 'cl-2',
      codigo_classificacao_id: null, status: 'cancelada', pendente: false, motivo_pendencia: null,
      setor: 'Operações', criado_por: 'u-dept-2', criado_em: agoraIso(), data_emissao: '2026-06-10', vencimento: '2026-07-20', competencia: '2026-06-01',
      aprovado_por: null, data_aprovacao: null, numero_chamado: null, data_pagamento: null,
      numero_lancamento_group: null, data_lancamento_group: null, data_validacao_csc: null, validado_por: null,
      anexo_arquivado_em: null, cancelado_por: 'u-dept-2', cancelado_em: agoraIso(), motivo_cancelamento: 'lançada em duplicidade',
      anexos: [], nota_rateios: [], nota_historico: [],
    },
    // Duas notas "lancado_no_group" com o MESMO pagador+vencimento --
    // "Abrir chamado" continua agrupando de verdade (um chamado cobre
    // várias notas), diferente de "Lançar no Group" (ver
    // ciclo_lote_selecao_checkboxes.mjs, que testa a seleção por
    // checkbox dentro de um grupo).
    {
      id: 'nota-11', numero_nota: 'NF-11', valor_bruto: '400.00', descricao: 'grupo abrir chamado a',
      pagador_id: 'pag-1', fornecedor_id: 'forn-8', forma_pagamento: 'Boleto bancário',
      classificacao: 'Compras', tem_rateio: false, centro_custo_id: 'cc-1', classe_conta_id: 'cl-1',
      codigo_classificacao_id: null, status: 'lancado_no_group', pendente: false, motivo_pendencia: null,
      setor: 'Marketing', criado_por: 'u-dept-1', criado_em: agoraIso(), data_emissao: '2026-06-01', vencimento: '2026-08-01', competencia: '2026-06-01',
      aprovado_por: 'u-gerente-1', data_aprovacao: agoraIso(), numero_chamado: null, data_pagamento: null,
      numero_lancamento_group: 'GR-11', data_lancamento_group: agoraIso(), data_validacao_csc: null, validado_por: null,
      anexo_arquivado_em: null,
      anexos: [], nota_rateios: [], nota_historico: [],
    },
    {
      id: 'nota-12', numero_nota: 'NF-12', valor_bruto: '350.00', descricao: 'grupo abrir chamado b',
      pagador_id: 'pag-1', fornecedor_id: 'forn-9', forma_pagamento: 'Boleto bancário',
      classificacao: 'Compras', tem_rateio: false, centro_custo_id: 'cc-1', classe_conta_id: 'cl-1',
      codigo_classificacao_id: null, status: 'lancado_no_group', pendente: false, motivo_pendencia: null,
      setor: 'Marketing', criado_por: 'u-dept-1', criado_em: agoraIso(), data_emissao: '2026-06-01', vencimento: '2026-08-01', competencia: '2026-06-01',
      aprovado_por: 'u-gerente-1', data_aprovacao: agoraIso(), numero_chamado: null, data_pagamento: null,
      numero_lancamento_group: 'GR-12', data_lancamento_group: agoraIso(), data_validacao_csc: null, validado_por: null,
      anexo_arquivado_em: null,
      anexos: [], nota_rateios: [], nota_historico: [],
    },
    {
      // Fornecedor em pré-cadastro (ver migration 0030) -- aprovada, mas
      // deve ficar de fora da fila "Lançar no Group" até o CP validar o
      // fornecedor (ver ui.js queueData('lancar_group')).
      id: 'nota-fornecedor-pendente-1', numero_nota: 'NF-FORN-PEND', valor_bruto: '700.00', descricao: 'aguardando fornecedor',
      pagador_id: 'pag-1', fornecedor_id: 'forn-precadastro-1', forma_pagamento: 'Boleto bancário',
      classificacao: 'Compras', tem_rateio: false, centro_custo_id: 'cc-1', classe_conta_id: 'cl-1',
      codigo_classificacao_id: null, status: 'aprovado', pendente: false, motivo_pendencia: null,
      setor: 'Marketing', criado_por: 'u-dept-1', criado_em: agoraIso(), data_emissao: '2026-06-01', vencimento: '2026-07-10', competencia: '2026-06-01',
      aprovado_por: 'u-gerente-1', data_aprovacao: agoraIso(), numero_chamado: null, data_pagamento: null,
      numero_lancamento_group: null, data_lancamento_group: null, data_validacao_csc: null, validado_por: null,
      anexo_arquivado_em: null,
      anexos: [], nota_rateios: [], nota_historico: [],
    },
    {
      // Perfil "recebedor" (ver migration 0029): só anexo + classificação,
      // nasce assim -- o resto (número, datas, valor, pagador...) ainda
      // não existe até um "completo" do mesmo setor completar.
      id: 'nota-recebida-1', numero_nota: null, valor_bruto: '0.00', descricao: null,
      pagador_id: null, fornecedor_id: null, forma_pagamento: null,
      classificacao: null, tem_rateio: false, centro_custo_id: 'cc-1', classe_conta_id: 'cl-1',
      codigo_classificacao_id: null, status: 'recebido', pendente: false, motivo_pendencia: null,
      setor: 'Marketing', criado_por: 'u-dept-recebedor-1', criado_em: agoraIso(), data_emissao: null, vencimento: null, competencia: null,
      aprovado_por: null, data_aprovacao: null, numero_chamado: null, data_pagamento: null,
      numero_lancamento_group: null, data_lancamento_group: null, data_validacao_csc: null, validado_por: null,
      anexo_arquivado_em: null,
      anexos: ['nota-recebida-1/123-boleto.pdf'], nota_rateios: [], nota_historico: [],
    },
    {
      // 'recebido' + pendente=true: o "completo" devolveu pedindo
      // documento -- criado_por é o PRÓPRIO recebedor de propósito aqui
      // (o teste de "qualquer recebedor pode resolver" usa um segundo
      // caso à parte, criado por outra pessoa).
      id: 'nota-recebida-pendente-1', numero_nota: null, valor_bruto: '0.00', descricao: null,
      pagador_id: null, fornecedor_id: null, forma_pagamento: null,
      classificacao: null, tem_rateio: false, centro_custo_id: 'cc-1', classe_conta_id: 'cl-1',
      codigo_classificacao_id: null, status: 'recebido', pendente: true, motivo_pendencia: 'Documento ilegível, reenvie o boleto.',
      setor: 'Marketing', criado_por: 'u-dept-recebedor-1', criado_em: agoraIso(), data_emissao: null, vencimento: null, competencia: null,
      aprovado_por: null, data_aprovacao: null, numero_chamado: null, data_pagamento: null,
      numero_lancamento_group: null, data_lancamento_group: null, data_validacao_csc: null, validado_por: null,
      anexo_arquivado_em: null,
      anexos: ['nota-recebida-pendente-1/456-boleto-ilegivel.pdf'], nota_rateios: [], nota_historico: [],
    },
  ],
  nota_historico: [],
  nota_rateios: [],
  fornecedor_contas: [
    { id: 'conta-0', fornecedor_id: 'forn-0', cod_banco: '001', agencia: '1234', conta: '5678-9' },
  ],
  caixinhas: [
    { id: 'caixinha-1', nome: 'Consórcio', valor_teto: 1000, setor: 'Financeiro', ativo: true, criado_em: agoraIso() },
    { id: 'caixinha-2', nome: 'Vértico', valor_teto: 500, setor: 'Operações', ativo: true, criado_em: agoraIso() },
    { id: 'caixinha-3', nome: 'Fundo', valor_teto: 300, setor: 'Marketing', ativo: true, criado_em: agoraIso() },
  ],
  caixinha_movimentacoes: [
    // Já aprovada -- pra testar o cálculo de saldo (teto 1000 - 200 = 800).
    { id: 'mov-1', caixinha_id: 'caixinha-1', tipo: 'saida', valor: 200, data: '2026-07-01', motivo: 'compra emergencial', comprovante: null, status: 'aprovado', criado_por: 'u-dept-1', criado_em: agoraIso(), aprovado_por: 'u-gerente-1', aprovado_em: agoraIso(), motivo_rejeicao: null },
    // Pendente -- pra testar a fila de aprovação (aparece pro gerente/admin, não afeta saldo ainda).
    { id: 'mov-2', caixinha_id: 'caixinha-1', tipo: 'saida', valor: 50, data: '2026-07-05', motivo: 'material de limpeza', comprovante: null, status: 'pendente_aprovacao', criado_por: 'u-cp-1', criado_em: agoraIso(), aprovado_por: null, aprovado_em: null, motivo_rejeicao: null },
  ],
};

let currentUser = { id: 'auth-1', email: 'dept@central-cp.local' };
export function __setCurrentUser(u) { currentUser = u; }
export function __fixtures() { return FIXTURES; }

function makeResult(data) {
  const p = Promise.resolve({ data, error: null });
  p.select = () => p;
  p.eq = () => p;
  p.order = () => p;
  p.single = () => Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error: null });
  p.maybeSingle = () => Promise.resolve({ data: Array.isArray(data) ? (data[0] || null) : data, error: null });
  return p;
}

// Espelha a policy "caixinhas: leitura"/"caixinha_movimentacoes: leitura"
// (0027_caixinha_por_setor.sql): departamento só vê a caixinha do próprio
// setor; contas_a_pagar/gerente_financeiro/administrador veem todas. Sem
// isso o mock devolveria tudo pra todo mundo (limitação geral documentada
// no topo do arquivo), o que esconderia uma regressão real nessa regra
// específica -- por isso o único caso especial simulado aqui.
function usuarioAtualMock() {
  return FIXTURES.usuarios.find(u => u.auth_user_id === currentUser.id);
}
function vePorSetor(caixinhaSetor) {
  const eu = usuarioAtualMock();
  if (!eu) return false;
  const papeis = papeisEfetivosMock(eu.id);
  if (papeis.includes('administrador') || papeis.includes('gerente_financeiro') || papeis.includes('contas_a_pagar')) return true;
  return papeis.includes('departamento') && caixinhaSetor === eu.setor;
}

function queryBuilder(table) {
  return {
    select(cols) {
      let data = FIXTURES[table] || [];
      // fornecedores select('*, fornecedor_contas(*)') -- único join de
      // verdade que este mock simula: computa a lista na hora, a partir
      // da tabela fornecedor_contas separada, pra refletir inserts/deletes
      // feitos depois do fixture inicial (ver adicionarFornecedor/
      // atualizarFornecedor em db.js).
      if (table === 'fornecedores' && typeof cols === 'string' && cols.includes('fornecedor_contas')) {
        data = data.map(f => ({ ...f, fornecedor_contas: (FIXTURES.fornecedor_contas || []).filter(c => c.fornecedor_id === f.id) }));
      }
      if (table === 'caixinhas') data = data.filter(c => vePorSetor(c.setor));
      if (table === 'caixinha_movimentacoes') {
        data = data.filter(m => {
          const c = (FIXTURES.caixinhas || []).find(x => x.id === m.caixinha_id);
          return c && vePorSetor(c.setor);
        });
      }
      const result = makeResult(data);
      result.eq = (col, val) => makeResult(data.filter(r => String(r[col]) === String(val)));
      result.order = () => result;
      result.range = (from, to) => makeResult(data.slice(from, to + 1));
      return result;
    },
    insert(rows) {
      const arr = Array.isArray(rows) ? rows : [rows];
      const withIds = arr.map((r, i) => ({ id: `new-${table}-${Date.now()}-${i}`, ativo: true, ...r }));
      (FIXTURES[table] || (FIXTURES[table] = [])).push(...withIds);
      return makeResult(withIds);
    },
    // upsert genérico: casa pelas colunas de onConflict (ex: "fornecedor_id,campo")
    // -- se já existe uma linha com os mesmos valores nessas colunas, atualiza
    // no lugar; senão insere (mesma semântica do onConflict real do Postgres).
    upsert(row, { onConflict } = {}) {
      const list = FIXTURES[table] || (FIXTURES[table] = []);
      const chaves = (onConflict || '').split(',').map(s => s.trim()).filter(Boolean);
      const existente = chaves.length ? list.find(r => chaves.every(k => String(r[k]) === String(row[k]))) : null;
      if (existente) { Object.assign(existente, row); return makeResult([existente]); }
      const novo = { id: `new-${table}-${Date.now()}`, ...row };
      list.push(novo);
      return makeResult([novo]);
    },
    update(patch) {
      return {
        eq(col, val) {
          const list = FIXTURES[table] || [];
          const row = list.find(r => String(r[col]) === String(val));
          if (row) Object.assign(row, patch);
          return makeResult([{ id: val, ...patch }]);
        },
      };
    },
    delete() {
      return {
        eq(col, val) {
          const list = FIXTURES[table] || [];
          const removidos = list.filter(r => String(r[col]) === String(val));
          FIXTURES[table] = list.filter(r => String(r[col]) !== String(val));
          return makeResult(removidos);
        },
      };
    },
  };
}

// Espelha papeis_efetivos() do banco: papel próprio + papel de quem te
// delegou algo ativo agora — usado pelos testes que dependem do RPC real.
function papeisEfetivosMock(usuarioId) {
  const eu = FIXTURES.usuarios.find(u => u.id === usuarioId);
  if (!eu) return [];
  const hojeStr = new Date().toISOString().slice(0, 10);
  const papeis = new Set([eu.role]);
  FIXTURES.delegacoes.forEach(d => {
    if (d.delegado_id === usuarioId && d.ativo && d.data_inicio <= hojeStr && hojeStr <= d.data_fim) {
      const titular = FIXTURES.usuarios.find(u => u.id === d.titular_id);
      if (titular && titular.ativo) papeis.add(titular.role);
    }
  });
  return Array.from(papeis);
}

export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: { user: currentUser } } }),
    getUser: async () => ({ data: { user: currentUser } }),
    signInWithPassword: async () => ({ data: { user: currentUser }, error: null }),
    signUp: async () => ({ data: { user: currentUser }, session: {}, error: null }),
    signOut: async () => ({}),
    resetPasswordForEmail: async () => ({ error: null }),
    updateUser: async () => ({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  from(table) {
    return queryBuilder(table);
  },
  rpc(name, params) {
    if (name === 'papeis_efetivos') {
      const eu = FIXTURES.usuarios.find(u => u.auth_user_id === currentUser.id);
      return Promise.resolve({ data: eu ? papeisEfetivosMock(eu.id) : [], error: null });
    }
    if (name === 'stats_armazenamento') {
      const eu = FIXTURES.usuarios.find(u => u.auth_user_id === currentUser.id);
      const papeis = eu ? papeisEfetivosMock(eu.id) : [];
      if (!papeis.includes('administrador')) {
        return Promise.resolve({ data: null, error: { message: 'Só administrador pode ver as estatísticas de armazenamento.' } });
      }
      return Promise.resolve({ data: [{ banco_bytes: 13569171, storage_bytes: 291778, storage_arquivos: 1 }], error: null });
    }
    // Espelha a RPC arquivar_anexos_lote() (migration 0014): checa
    // eh_operador_cadastro() (administrador/gerente_financeiro/contas_a_pagar)
    // ela mesma, e o trigger bloquear_arquivamento_sem_chamado (migration
    // 0012) -- não depende da policy de status de "notas: update" como um
    // update direto dependeria (era o bug real corrigido pela RPC:
    // contas_a_pagar não conseguia arquivar nota já 'pago').
    if (name === 'arquivar_anexos_lote') {
      const eu = FIXTURES.usuarios.find(u => u.auth_user_id === currentUser.id);
      const papeis = eu ? papeisEfetivosMock(eu.id) : [];
      const operadorCadastro = papeis.includes('administrador') || papeis.includes('gerente_financeiro') || papeis.includes('contas_a_pagar');
      if (!operadorCadastro) {
        return Promise.resolve({ data: null, error: { message: 'Sem permissão para arquivar anexos.' } });
      }
      const ids = (params && params.p_nota_ids) || [];
      for (const id of ids) {
        const nota = FIXTURES.notas.find(n => n.id === id);
        if (nota && !nota.numero_chamado) {
          return Promise.resolve({ data: null, error: { message: 'Só é possível arquivar anexos de notas que já têm chamado aberto no Acelerato.' } });
        }
      }
      ids.forEach(id => {
        const nota = FIXTURES.notas.find(n => n.id === id);
        if (nota && !nota.anexo_arquivado_em) {
          nota.anexo_arquivado_em = new Date().toISOString();
          FIXTURES.nota_historico.push({ id: `h-arq-${Date.now()}-${id}`, nota_id: id, usuario_id: eu.id, acao: 'Anexo arquivado e removido do Storage', detalhe: 'Baixado em lote e movido para a rede local da empresa', criado_em: agoraIso() });
        }
      });
      return Promise.resolve({ data: null, error: null });
    }
    return Promise.resolve({ data: null, error: { message: `rpc mock desconhecido: ${name}` } });
  },
  functions: {
    invoke: async (name, { body } = {}) => {
      if (name === 'convidar-usuario') {
        if (body.action === 'convidar') {
          const novo = {
            id: `new-usuarios-${Date.now()}`, auth_user_id: `new-auth-${Date.now()}`,
            nome: body.nome, email: body.email, role: body.role, setor: body.setor || null, ativo: true,
          };
          FIXTURES.usuarios.push(novo);
          return { data: { usuario: novo, avisoEmail: null }, error: null };
        }
        if (body.action === 'desativar' || body.action === 'reativar') {
          const alvo = FIXTURES.usuarios.find(u => u.id === body.usuarioId);
          if (alvo) alvo.ativo = body.action === 'reativar';
          return { data: { ok: true }, error: null };
        }
        if (body.action === 'redefinir_senha') {
          const alvo = FIXTURES.usuarios.find(u => u.id === body.usuarioId);
          if (!alvo) return { data: null, error: { message: 'Usuário não encontrado.' } };
          if (!body.novaSenha || body.novaSenha.length < 6) return { data: null, error: { message: 'A nova senha precisa ter pelo menos 6 caracteres.' } };
          return { data: { ok: true }, error: null };
        }
      }
      return { data: null, error: { message: 'ação desconhecida no mock' } };
    },
  },
  storage: {
    _objetos: [
      { bucket: 'anexos-notas', path: 'nota-5/BSB_COND_01-06_FORNECEDOR_4_NF5_BOLETO.pdf', file: (typeof Blob !== 'undefined' ? new Blob(['conteudo-fake-nota-5'], { type: 'application/pdf' }) : { type: 'application/pdf' }) },
      { bucket: 'anexos-notas', path: 'nota-7/BSB_COND_01-07_FORNECEDOR_4_NF7_BOLETO.pdf', file: (typeof Blob !== 'undefined' ? new Blob(['conteudo-fake-nota-7'], { type: 'application/pdf' }) : { type: 'application/pdf' }) },
      { bucket: 'anexos-notas', path: 'nota-recebida-1/123-boleto.pdf', file: (typeof Blob !== 'undefined' ? new Blob(['conteudo-fake-recebida-1'], { type: 'application/pdf' }) : { type: 'application/pdf' }) },
      { bucket: 'anexos-notas', path: 'nota-recebida-pendente-1/456-boleto-ilegivel.pdf', file: (typeof Blob !== 'undefined' ? new Blob(['conteudo-fake-recebida-pendente-1'], { type: 'application/pdf' }) : { type: 'application/pdf' }) },
      { bucket: 'documentos-fornecedor', path: 'forn-precadastro-1/123-contrato.pdf', file: (typeof Blob !== 'undefined' ? new Blob(['conteudo-fake-contrato'], { type: 'application/pdf' }) : { type: 'application/pdf' }) },
    ],
    from(bucket) {
      const self = supabase.storage;
      return {
        upload: async (path, file) => {
          self._objetos = self._objetos.filter(o => !(o.bucket === bucket && o.path === path));
          self._objetos.push({ bucket, path, file });
          return { data: { path }, error: null };
        },
        download: async (path) => {
          const obj = self._objetos.find(o => o.bucket === bucket && o.path === path);
          if (!obj) return { data: null, error: { message: `objeto não encontrado: ${path}` } };
          return { data: obj.file, error: null };
        },
        remove: async (paths) => {
          self._objetos = self._objetos.filter(o => !(o.bucket === bucket && paths.includes(o.path)));
          return { data: paths.map(path => ({ path })), error: null };
        },
        createSignedUrl: async (path) => ({ data: { signedUrl: `https://mock.local/${bucket}/${path}?signed=1` }, error: null }),
        list: async (prefix) => {
          const nomes = self._objetos
            .filter(o => o.bucket === bucket && o.path.startsWith(`${prefix}/`))
            .map(o => ({ name: o.path.slice(prefix.length + 1) }));
          return { data: nomes, error: null };
        },
      };
    },
  },
};
