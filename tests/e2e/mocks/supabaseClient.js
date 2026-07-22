// tests/e2e/mocks/supabaseClient.js
//
// Roda de verdade num Chromium real (Playwright), não em Node/jsdom --
// por isso Blob/File/JSZip/pdf-lib/exceljs (todos carregados via CDN
// pelo próprio app) funcionam nativamente aqui, ao contrário da suíte
// jsdom (tests/regressao), que não consegue testar essas três coisas.
//
// Um usuário só (administrador -- eh_super_usuario(), então consegue
// executar o fluxo inteiro sozinho: lançar, aprovar automaticamente,
// lançar no Group, abrir chamado) evita ter que recarregar a página pra
// trocar de sessão, o que perderia o estado em memória entre uma etapa e
// outra (cada carregamento de página reinicia os FIXTURES do zero, já
// que isso não é um servidor de verdade com persistência).
const FIXTURES = {
  usuarios: [
    { id: 'u-admin-e2e', auth_user_id: 'auth-admin-e2e', nome: 'Admin E2E', role: 'administrador', setor: null, email: 'admin-e2e@central-cp.local', ativo: true, criado_em: new Date().toISOString() },
  ],
  delegacoes: [],
  setores: [
    { id: 'set-1', nome: 'Operações', pagador_padrao_id: 'pag-1' },
    { id: 'set-2', nome: 'Marketing', pagador_padrao_id: null },
    { id: 'set-3', nome: 'Financeiro', pagador_padrao_id: null },
  ],
  pagadores: [{ id: 'pag-1', nome: 'Condomínio', sigla: 'COND' }],
  centros_custo: [{ id: 'cc-1', codigo: '2.01', nome: 'ADMINISTRATIVO', sigla: 'ADM', origem_siglas: ['COND'] }],
  classes_conta: [{ id: 'cl-1', codigo: '2.01.01', nome: 'SALARIOS', centro_custo_id: 'cc-1' }],
  codigos_classificacao: [],
  fornecedores: [{ id: 'forn-1', nome: 'Fornecedor E2E', cnpj: null, municipio: 'BAURU', cod_group: null, pessoa_tipo: null, tipo_contratacao_padrao: null, contrato_vigencia_inicio: null, contrato_vigencia_fim: null, contrato_observacoes: null }],
  notas: [],
  nota_historico: [],
  nota_rateios: [],
  fornecedor_contas: [],
};

let currentUser = (typeof window !== 'undefined' && window.__E2E_USER__) || { id: 'auth-admin-e2e', email: 'admin-e2e@central-cp.local' };
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
      if (table === 'fornecedores' && typeof cols === 'string' && cols.includes('fornecedor_contas')) {
        data = data.map(f => ({ ...f, fornecedor_contas: (FIXTURES.fornecedor_contas || []).filter(c => c.fornecedor_id === f.id) }));
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

export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: { user: currentUser } } }),
    getUser: async () => ({ data: { user: currentUser } }),
    signInWithPassword: async () => ({ data: { user: currentUser }, error: null }),
    signOut: async () => ({}),
    resetPasswordForEmail: async () => ({ error: null }),
    updateUser: async () => ({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  from(table) {
    return queryBuilder(table);
  },
  rpc(name) {
    if (name === 'papeis_efetivos') return Promise.resolve({ data: ['administrador'], error: null });
    return Promise.resolve({ data: null, error: null });
  },
  functions: { invoke: async () => ({ data: null, error: { message: 'não usado neste teste' } }) },
  storage: {
    _objetos: [],
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
