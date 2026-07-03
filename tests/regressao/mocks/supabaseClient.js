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
    { id: 'u-dept-1', auth_user_id: 'auth-1', nome: 'Depto Teste', role: 'departamento', setor: 'Marketing', email: 'dept@central-cp.local', ativo: true, criado_em: agoraIso() },
    { id: 'u-cp-1', auth_user_id: 'auth-cp-1', nome: 'CP Teste', role: 'contas_a_pagar', setor: null, email: 'cp@central-cp.local', ativo: true, criado_em: agoraIso() },
    { id: 'u-gerente-1', auth_user_id: 'auth-gerente-1', nome: 'Gerente Teste', role: 'gerente_financeiro', setor: null, email: 'gerente@central-cp.local', ativo: true, criado_em: agoraIso() },
    { id: 'u-admin-1', auth_user_id: 'auth-admin-1', nome: 'Admin Teste', role: 'administrador', setor: null, email: 'admin@central-cp.local', ativo: true, criado_em: agoraIso() },
    { id: 'u-dept-ferias-1', auth_user_id: 'auth-dept-ferias-1', nome: 'Depto Ferias Teste', role: 'departamento', setor: 'Financeiro', email: 'ferias@central-cp.local', ativo: true, criado_em: agoraIso() },
    { id: 'u-dept-2', auth_user_id: 'auth-dept-2', nome: 'Depto Operacoes', role: 'departamento', setor: 'Operações', email: 'dept2@central-cp.local', ativo: true, criado_em: agoraIso() },
    { id: 'u-inativo-1', auth_user_id: 'auth-inativo-1', nome: 'Usuario Desativado', role: 'departamento', setor: 'Marketing', email: 'inativo@central-cp.local', ativo: false, criado_em: agoraIso() },
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
  fornecedores: Array.from({ length: 20 }).map((_, i) => ({
    id: `forn-${i}`, nome: `Fornecedor Teste ${i}`, cnpj: null, municipio: 'BAURU', cod_group: null,
    fornecedor_contas: i === 0 ? [{ id: `conta-${i}`, fornecedor_id: `forn-${i}`, cod_banco: '001', agencia: '1234', conta: '5678-9' }] : [],
  })),
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
  ],
  nota_historico: [],
  nota_rateios: [],
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

function queryBuilder(table) {
  return {
    select(cols) {
      let data = FIXTURES[table] || [];
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
      }
      return { data: null, error: { message: 'ação desconhecida no mock' } };
    },
  },
  storage: {
    _objetos: [
      { bucket: 'anexos-notas', path: 'nota-5/BSB_COND_01-06_FORNECEDOR_4_NF5_BOLETO.pdf', file: (typeof Blob !== 'undefined' ? new Blob(['conteudo-fake-nota-5'], { type: 'application/pdf' }) : { type: 'application/pdf' }) },
      { bucket: 'anexos-notas', path: 'nota-7/BSB_COND_01-07_FORNECEDOR_4_NF7_BOLETO.pdf', file: (typeof Blob !== 'undefined' ? new Blob(['conteudo-fake-nota-7'], { type: 'application/pdf' }) : { type: 'application/pdf' }) },
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
