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
  validado_csc: 'Validado CSC', pago: 'Pago', cancelada: 'Cancelada',
};
// As 5 etapas "em andamento" (do lançamento até a validação do CSC) são uma
// PROGRESSÃO, não categorias independentes -- por isso usam uma rampa de UM
// hue só, claro->escuro (--seq-1..5, ver styles.css), na ordem da esteira.
// "Pago" e "cancelada" são estados terminais de verdade (sucesso/parada),
// esses sim ganham cor própria (--good/--alert).
export const STATUS_COLOR = {
  lancado: 'var(--seq-1)', aprovado: 'var(--seq-2)',
  lancado_no_group: 'var(--seq-3)', chamado_aberto: 'var(--seq-4)',
  validado_csc: 'var(--seq-5)', pago: 'var(--good)', cancelada: 'var(--alert)',
};
// Fundo dos badges: um único tom suave pra toda etapa "em andamento" (é o
// TEXTO -- a rampa acima -- que mostra a progressão; o fundo não precisa
// repetir esse trabalho, e 5 fundos quase-brancos diferentes lado a lado só
// acrescentaria ruído sem ajudar a leitura). Pago/cancelada continuam com
// fundo próprio, coerente com a cor de texto de cada um.
export const STATUS_SOFT = {
  lancado: 'var(--brand-soft)', aprovado: 'var(--brand-soft)',
  lancado_no_group: 'var(--brand-soft)', chamado_aberto: 'var(--brand-soft)',
  validado_csc: 'var(--brand-soft)', pago: 'var(--good-soft)', cancelada: 'var(--alert-soft)',
};
export const STEPS = ['lancado', 'aprovado', 'lancado_no_group', 'chamado_aberto', 'validado_csc', 'pago'];

export const TIPO_IMPOSTO_LABEL = {
  irrf: 'IRRF', iss: 'ISS', pis_cofins_csll: 'PIS/COFINS/CSLL', inss: 'INSS', outro: 'Outro',
};

export const REGISTRY_DEFS = {
  fornecedores:          { label: 'Fornecedores', custom: 'fornecedor' },
  pagadores:             { label: 'Pagadores (Origem)',      fields: [{ key: 'nome', label: 'Nome', required: true }, { key: 'sigla', label: 'Sigla', required: true }] },
  centros_custo:         { label: 'Centros de custo',        fields: [{ key: 'codigo', label: 'Código', required: true }, { key: 'nome', label: 'Nome', required: true }, { key: 'origem_siglas', label: 'Aplica-se à(s) origem(ns)', type: 'origens' }] },
  classes_conta:         { label: 'Classe da conta',         fields: [{ key: 'codigo', label: 'Código', required: true }, { key: 'nome', label: 'Nome', required: true }, { key: 'centro_custo_id', label: 'Centro de custo', type: 'select-centro', required: true }] },
  codigos_classificacao: { label: 'Código da classificação', fields: [{ key: 'codigo', label: 'Código', required: true }, { key: 'nome', label: 'Descrição', required: true }, { key: 'classe_conta_id', label: 'Classe da conta', type: 'select-classe', required: true }] },
  usuarios:              { label: 'Usuários', custom: 'usuario', restritoA: 'administrador' },
  delegacoes:            { label: 'Delegações', custom: 'delegacao', restritoA: 'super' },
  importar:              { label: 'Importar histórico', custom: 'importar', restritoA: 'administrador' },
  armazenamento:         { label: 'Armazenamento', custom: 'armazenamento', restritoA: 'administrador' },
  arquivos:              { label: 'Arquivos', custom: 'arquivos', restritoA: 'operador_cadastro' },
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
  // Dicas de extração aprendidas por fornecedor (painel "ensinar o
  // leitor", ver aprendizado_extracao.js) -- { fornecedor_id, campo,
  // ancora, valor_exemplo }, uma por (fornecedor, campo).
  extracaoHints: [],
  // Respostas dadas no painel "ensinar o leitor" ANTES de escolher o
  // fornecedor (a ordem do formulário é anexar primeiro) -- ficam em fila
  // aqui e só viram uma dica de verdade (salva por fornecedor) quando o
  // fornecedor é selecionado. { campo, valor, texto }.
  hintsPendentes: [],
  state: {
    view: 'minhas', modal: null, modalData: null, flash: null, cadastroTab: 'fornecedores', cadFornecedorBusca: '', recuperandoSenha: false,
    // Aba ativa dentro de "Configurações" (ver ui_configuracoes.js) --
    // Cadastros, Notificações ou Meus dados.
    configTab: 'cadastros',
    // Gaveta lateral do menu mobile (hambúrguer, ver ui_mobile.js) — só
    // exibição, sempre começa fechada, não precisa persistir entre sessões.
    menuMobileAberto: false,
    // Status de Web Push (ver push.js) -- recalculado em carregarTudo()
    // (app.js) a cada login/refresh; controla o botão "Ativar
    // notificações" na sidebar/gaveta mobile.
    pushSuportado: false,
    pushInscrito: false,
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
    // Ids de nota com o rateio expandido em "Todas as notas" (mostrando
    // linha a linha) — puramente de exibição, não precisa persistir.
    rateiosExpandidos: new Set(),
  },
  rateioTemp: [],
  temRateio: false,
  impostoTemp: [],
  temImposto: false,
  fornecedorContasTemp: [],
  // Lançamento em lote: uma tabela de linhas que viram notas individuais
  // ao salvar (nunca uma nota "agrupada" — é só o preenchimento que é em
  // lote). loteEditingIndex aponta pra linha aberta no popup de detalhes
  // (rateio/imposto/anexos/campos menos comuns) enquanto ele está aberto.
  loteRows: [],
  loteEditingIndex: null,
  // Anexos: arquivos File() escolhidos mas ainda não enviados, e caminhos
  // de anexos já existentes marcados pra remover — nada disso é aplicado
  // de verdade até o Salvar (mesmo padrão do rateioTemp: cancelar descarta).
  anexosNovos: [],
  anexosRemovidos: [],
  // Uma entrada por item de anexosNovos (mesmo índice), preenchida
  // assincronamente pelo leitor de documentos: null/undefined enquanto
  // ainda não rodou, { status: 'analisando'|'pronto'|'erro', resultado }
  // depois. Nunca bloqueia o salvar -- é só a auditoria (documento WE9).
  anexosAnalises: [],
  // Importação de histórico (aba Cadastros → Importar, só administrador):
  // resultado da última leitura de planilha (prontas/erros/avisos) e o
  // resumo da última execução — nenhum dos dois precisa persistir entre
  // sessões, só entre as telas do fluxo de upload → conferência → confirmação.
  importar: { resultado: null, resumoFinal: null },
  // Armazenamento (aba Cadastros → Armazenamento, só administrador):
  // última leitura de stats_armazenamento() — carregada sob demanda.
  armazenamentoStats: null,
  // Arquivos (aba Cadastros → Arquivos): grupos (pagador+tipo de nota) cujo
  // zip já foi baixado nesta sessão e estão prontos pra confirmar o
  // arquivamento — só exibição, não precisa persistir entre sessões.
  gruposArquivadosProntos: new Set(),
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
  const texto = String(d);
  // Data "pura" (coluna DATE do Postgres, sem hora: "AAAA-MM-DD") --
  // `new Date("AAAA-MM-DD")` interpreta isso como meia-noite UTC, e
  // formatar no fuso local (Brasil, UTC-3) volta um dia (ex: vencimento
  // 23/07 aparecia como 22/07 na tela). Formata direto da string, sem
  // passar por Date/fuso horário nenhum. Timestamp de verdade (com hora,
  // ex: anexo_arquivado_em) continua indo pelo Date normalmente — aí a
  // conversão de fuso é o comportamento certo.
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    const [ano, mes, dia] = texto.split('-');
    return `${dia}/${mes}/${ano}`;
  }
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

// Contrato vencido = tem data de fim de vigência cadastrada e ela já
// passou (relativa a "hoje" ou à data de referência informada, ex: a
// data de emissão da nota). Comparação pura de string ISO (AAAA-MM-DD),
// sem passar por Date -- mesma cautela de fmtDate() com fuso horário.
export function contratoVencido(fornecedor, dataReferenciaIso) {
  if (!fornecedor || !fornecedor.contrato_vigencia_fim) return false;
  const referencia = (dataReferenciaIso || new Date().toISOString()).slice(0, 10);
  return fornecedor.contrato_vigencia_fim.slice(0, 10) < referencia;
}
