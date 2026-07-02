// src/js/state.js
import { SETORES, LIMITE_APROVACAO_GESTOR } from './config.js';

export { SETORES, LIMITE_APROVACAO_GESTOR };

export const ROLE_LABEL = {
  departamento: 'Departamento', contas_a_pagar: 'Contas a pagar',
  gerente_financeiro: 'Gerente Financeiro', administrador: 'Administrador',
};
export const STATUS_LABEL = {
  lancado: 'Lançado', aprovado: 'Aprovado',
  lancado_no_group: 'Lançado no Group', chamado_aberto: 'Chamado aberto',
  validado_csc: 'Validado CSC', pago: 'Pago',
};
export const STATUS_COLOR = {
  lancado: 'var(--ink-soft)', aprovado: 'var(--brand)',
  lancado_no_group: 'var(--brand-dark)', chamado_aberto: 'var(--amber)',
  validado_csc: 'var(--info)', pago: 'var(--good)',
};
export const STATUS_SOFT = {
  lancado: 'var(--gray-soft)', aprovado: 'var(--brand-soft)',
  lancado_no_group: 'var(--brand-soft)', chamado_aberto: 'var(--amber-soft)',
  validado_csc: 'var(--info-soft)', pago: 'var(--good-soft)',
};
export const STEPS = ['lancado', 'aprovado', 'lancado_no_group', 'chamado_aberto', 'validado_csc', 'pago'];

export const REGISTRY_DEFS = {
  fornecedores:          { label: 'Fornecedores', custom: 'fornecedor' },
  pagadores:             { label: 'Pagadores (Origem)',      fields: [{ key: 'nome', label: 'Nome', required: true }, { key: 'sigla', label: 'Sigla', required: true }] },
  centros_custo:         { label: 'Centros de custo',        fields: [{ key: 'codigo', label: 'Código', required: true }, { key: 'nome', label: 'Nome', required: true }, { key: 'origem_siglas', label: 'Aplica-se à(s) origem(ns)', type: 'origens' }] },
  classes_conta:         { label: 'Classe da conta',         fields: [{ key: 'codigo', label: 'Código', required: true }, { key: 'nome', label: 'Nome', required: true }, { key: 'centro_custo_id', label: 'Centro de custo', type: 'select-centro', required: true }] },
  codigos_classificacao: { label: 'Código da classificação', fields: [{ key: 'codigo', label: 'Código', required: true }, { key: 'nome', label: 'Descrição', required: true }, { key: 'classe_conta_id', label: 'Classe da conta', type: 'select-classe', required: true }] },
  usuarios:              { label: 'Usuários', custom: 'usuario', restritoA: 'administrador' },
  delegacoes:            { label: 'Delegações', custom: 'delegacao', restritoA: 'super' },
};

// ---------------------------------------------------------------------
// Estado global em memória. `cadastros` e `notas` são recarregados do
// Supabase; `state` controla só a navegação/UI (não persiste sozinho).
// ---------------------------------------------------------------------
export const app = {
  usuario: null,         // perfil logado (tabela `usuarios`)
  usuarios: [],          // todos os usuários (para resolver nomes de criado_por/aprovado_por/historico)
  usuariosCompletos: [], // com email/ativo — carregado sob demanda na aba Usuários (só administrador vê)
  papeisEfetivos: [],    // próprio papel + papel de quem te delegou (ver papeis_efetivos() no banco)
  delegacoes: [],
  cadastros: { pagadores: [], centros_custo: [], classes_conta: [], codigos_classificacao: [], fornecedores: [] },
  notas: [],
  state: {
    view: 'minhas', modal: null, modalData: null, flash: null, cadastroTab: 'fornecedores', cadFornecedorBusca: '', recuperandoSenha: false,
    // Filtros de "Todas as notas" / exportação. Por padrão mostra só o ano
    // corrente (por vencimento) — sem isso, com anos de histórico acumulado,
    // a tela e o Excel exportado ficariam cada vez mais pesados.
    filters: {
      status: '', busca: '', pendente: '', pagadorId: '', setor: '', centroCustoId: '',
      dataCampo: 'vencimento',
      dataDe: `${new Date().getFullYear()}-01-01`,
      dataAte: `${new Date().getFullYear()}-12-31`,
      competenciaDe: '', competenciaAte: '',
    },
  },
  rateioTemp: [],
  temRateio: false,
  fornecedorContasTemp: [],
  // Anexos: arquivos File() escolhidos mas ainda não enviados, e caminhos
  // de anexos já existentes marcados pra remover — nada disso é aplicado
  // de verdade até o Salvar (mesmo padrão do rateioTemp: cancelar descarta).
  anexosNovos: [],
  anexosRemovidos: [],
};

// Espelha as funções eh_super_usuario()/eh_operador_cadastro() do banco pro
// lado do cliente — só decide o que MOSTRAR na UI; quem garante de verdade
// é a RLS (se a UI mostrar um botão que a delegação já expirou, o clique
// simplesmente falha na RLS, não é um buraco de segurança).
export function ehSuperUsuario() {
  return app.papeisEfetivos.includes('administrador') || app.papeisEfetivos.includes('gerente_financeiro');
}
export function podeOperarCadastro() {
  return ehSuperUsuario() || app.papeisEfetivos.includes('contas_a_pagar');
}
export function ehAdministrador() {
  return app.papeisEfetivos.includes('administrador');
}

// IDs de quem delegou pra mim, ativo e dentro do período hoje — usado pra
// decidir o que mostrar como "minhas notas"/"posso editar" no cliente,
// espelhando pode_agir_como() do banco (que é quem garante de verdade).
export function delegantesAtivosParaMim() {
  if (!app.usuario) return [];
  const hoje = new Date().toISOString().slice(0, 10);
  return app.delegacoes
    .filter(d => d.delegado_id === app.usuario.id && d.ativo && d.data_inicio <= hoje && hoje <= d.data_fim)
    .map(d => d.titular_id);
}

export function podeAgirComo(usuarioId) {
  if (!app.usuario) return false;
  return usuarioId === app.usuario.id || delegantesAtivosParaMim().includes(usuarioId);
}

export function uid() {
  return (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

export function escapeHtml(s) {
  const d = document.createElement('div');
  d.innerText = s == null ? '' : String(s);
  return d.innerHTML;
}

export function fmtMoney(v) {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
export function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('pt-BR');
}
export function fmtCompetencia(d) {
  if (!d) return '—';
  const [ano, mes] = d.slice(0, 7).split('-');
  return `${mes}/${ano}`;
}
export function fmtDateTime(d) {
  const dt = new Date(d);
  return dt.toLocaleDateString('pt-BR') + ' às ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function labelOf(it) {
  if (!it) return '';
  if (it.codigo && it.nome) return `${it.codigo} – ${it.nome}`;
  return it.nome || '';
}
export function selectOptions(list, selectedId) {
  if (!list || list.length === 0) return `<option value="">Nenhum cadastrado</option>`;
  return `<option value="">Selecione...</option>` + list.map(it => `<option value="${it.id}" ${it.id === selectedId ? 'selected' : ''}>${escapeHtml(labelOf(it))}</option>`).join('');
}

export function centrosParaPagador(pagadorId) {
  const pag = app.cadastros.pagadores.find(p => p.id === pagadorId);
  if (!pag) return [];
  return app.cadastros.centros_custo.filter(c => (c.origem_siglas || []).includes(pag.sigla));
}
export function classesParaCentro(centroId) {
  return app.cadastros.classes_conta.filter(c => c.centro_custo_id === centroId);
}
export function codigosParaClasse(classeId) {
  return app.cadastros.codigos_classificacao.filter(c => c.classe_conta_id === classeId);
}

// Resolve os nomes (labels) de uma nota a partir dos IDs + cadastros já
// carregados em memória — substitui os campos `*_label` que o protótipo
// gravava direto no registro (aqui não duplicamos dado, resolvemos na hora).
export function resolverLabelsNota(n) {
  const pagador = app.cadastros.pagadores.find(p => p.id === n.pagador_id);
  const fornecedor = app.cadastros.fornecedores.find(f => f.id === n.fornecedor_id);
  const centro = app.cadastros.centros_custo.find(c => c.id === n.centro_custo_id);
  const classe = app.cadastros.classes_conta.find(c => c.id === n.classe_conta_id);
  const codigo = app.cadastros.codigos_classificacao.find(c => c.id === n.codigo_classificacao_id);
  let contaBancariaLabel = null;
  if (fornecedor && n.conta_bancaria_id) {
    const c = (fornecedor.contas || []).find(c => c.id === n.conta_bancaria_id);
    if (c) contaBancariaLabel = `Banco ${c.cod_banco || '—'} · Ag ${c.agencia || '—'} · CC ${c.conta || '—'}`;
  }
  return {
    pagador_label: pagador ? labelOf(pagador) : '—',
    fornecedor_label: fornecedor ? labelOf(fornecedor) : '—',
    centro_custo_label: centro ? labelOf(centro) : null,
    classe_conta_label: classe ? labelOf(classe) : null,
    codigo_classificacao_label: codigo ? labelOf(codigo) : null,
    conta_bancaria_label: contaBancariaLabel,
  };
}

// Mesma ideia, para uma linha de rateio (que guarda os IDs também).
export function resolverLabelsRateio(r) {
  const centro = app.cadastros.centros_custo.find(c => c.id === r.centro_custo_id);
  const classe = app.cadastros.classes_conta.find(c => c.id === r.classe_conta_id);
  const codigo = app.cadastros.codigos_classificacao.find(c => c.id === r.codigo_classificacao_id);
  return {
    centro_label: centro ? labelOf(centro) : '—',
    classe_label: classe ? labelOf(classe) : '—',
    codigo_label: codigo ? labelOf(codigo) : null,
  };
}

export function nomeUsuario(usuarioId) {
  const u = app.usuarios.find(u => u.id === usuarioId);
  return u ? u.nome : '—';
}
export function setorUsuario(usuarioId) {
  const u = app.usuarios.find(u => u.id === usuarioId);
  return u ? u.setor : null;
}
