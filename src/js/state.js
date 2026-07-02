// src/js/state.js
import { SETORES, LIMITE_APROVACAO_GESTOR } from './config.js';

export { SETORES, LIMITE_APROVACAO_GESTOR };

export const ROLE_LABEL = { departamento: 'Departamento', contas_a_pagar: 'Contas a pagar', gestor: 'Gestor / Aprovador' };
export const STATUS_LABEL = { lancado: 'Lançado', aprovado: 'Aprovado', em_pagamento: 'Em pagamento', pago: 'Pago' };
export const STATUS_COLOR = { lancado: 'var(--ink-soft)', aprovado: 'var(--brand)', em_pagamento: 'var(--amber)', pago: 'var(--good)' };
export const STATUS_SOFT  = { lancado: 'var(--gray-soft)', aprovado: 'var(--brand-soft)', em_pagamento: 'var(--amber-soft)', pago: 'var(--good-soft)' };
export const STEPS = ['lancado', 'aprovado', 'em_pagamento', 'pago'];

export const REGISTRY_DEFS = {
  fornecedores:          { label: 'Fornecedores', custom: 'fornecedor' },
  pagadores:             { label: 'Pagadores (Origem)',      fields: [{ key: 'nome', label: 'Nome', required: true }, { key: 'sigla', label: 'Sigla', required: true }] },
  centros_custo:         { label: 'Centros de custo',        fields: [{ key: 'codigo', label: 'Código', required: true }, { key: 'nome', label: 'Nome', required: true }, { key: 'origem_siglas', label: 'Aplica-se à(s) origem(ns)', type: 'origens' }] },
  classes_conta:         { label: 'Classe da conta',         fields: [{ key: 'codigo', label: 'Código', required: true }, { key: 'nome', label: 'Nome', required: true }, { key: 'centro_custo_id', label: 'Centro de custo', type: 'select-centro', required: true }] },
  codigos_classificacao: { label: 'Código da classificação', fields: [{ key: 'codigo', label: 'Código', required: true }, { key: 'nome', label: 'Descrição', required: true }, { key: 'classe_conta_id', label: 'Classe da conta', type: 'select-classe', required: true }] },
};

// ---------------------------------------------------------------------
// Estado global em memória. `cadastros` e `notas` são recarregados do
// Supabase; `state` controla só a navegação/UI (não persiste sozinho).
// ---------------------------------------------------------------------
export const app = {
  usuario: null,         // perfil logado (tabela `usuarios`)
  usuarios: [],          // todos os usuários (para resolver nomes de criado_por/aprovado_por/historico)
  cadastros: { pagadores: [], centros_custo: [], classes_conta: [], codigos_classificacao: [], fornecedores: [] },
  notas: [],
  state: { view: 'minhas', modal: null, modalData: null, flash: null, filters: { status: '', busca: '' }, cadastroTab: 'fornecedores', cadFornecedorBusca: '' },
  rateioTemp: [],
  temRateio: false,
  fornecedorContasTemp: [],
};

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
