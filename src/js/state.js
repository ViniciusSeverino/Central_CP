// src/js/state.js
import { LIMITE_APROVACAO_GESTOR } from './config.js';

export { LIMITE_APROVACAO_GESTOR };

// Setores (departamentos) agora são cadastráveis pelo administrador (ver
// migration 0034 + aba Cadastros → Departamentos) -- deixou de ser uma
// lista fixa no código. Começa com os 3 originais como fallback (mesmo
// valor de sempre) até carregarCadastros() resolver a lista de verdade em
// carregarTudo() (app.js); atualizarSetoresDisponiveis() reatribui esta
// mesma variável exportada -- binding vivo de módulo ES, então quem
// importa `SETORES` em outro arquivo (ui.js, ui_nota.js etc.) enxerga a
// atualização sem precisar reimportar nada.
export let SETORES = ['Marketing', 'Operações', 'Financeiro'];
export function atualizarSetoresDisponiveis(nomes) { SETORES = nomes; }

export const ROLE_LABEL = {
  departamento: 'Departamento', contas_a_pagar: 'Contas a pagar',
  gerente_financeiro: 'Gerente Financeiro', administrador: 'Administrador',
};
export const STATUS_LABEL = {
  recebido: 'Recebido', lancado: 'Lançado', aprovado: 'Aprovado',
  lancado_no_group: 'Lançado no Group', chamado_aberto: 'Chamado aberto',
  validado_csc: 'Validado CSC', pago: 'Pago', cancelada: 'Cancelada',
};
// "Recebedor": perfil mais simples dentro do role departamento -- só anexa
// documento(s) e informa a classificação, não lança a nota inteira (ver
// migration 0029 e ui_recebimento.js). Não é uma role à parte -- é só um
// nível de usuarios.perfil_departamento.
export const PERFIL_DEPARTAMENTO_LABEL = {
  recebedor: 'Recebedor (só anexa e classifica)',
  completo: 'Completo (lança a nota inteira)',
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
// Rascunhos ficam FORA do STATUS_LABEL de propósito: a importação de
// histórico (import_historico.js) aceita como status válido todo rótulo
// desse mapa. Pra EXIBIR qualquer status (inclusive rascunhos) use
// statusLabel() -- antes cada tela indexava o mapa direto e mostrava
// "undefined". A cor do status na tela vem da classe .st-<status>
// (styles.css), não deste arquivo.
const STATUS_LABEL_RASCUNHO = { rascunho: 'Rascunho', rascunho_recebimento: 'Rascunho (recebimento)' };
export function statusLabel(status) {
  return STATUS_LABEL[status] || STATUS_LABEL_RASCUNHO[status] || status;
}
export const STEPS = ['lancado', 'aprovado', 'lancado_no_group', 'chamado_aberto', 'validado_csc', 'pago'];

export const TIPO_IMPOSTO_LABEL = {
  irrf: 'IRRF', iss: 'ISS', pis_cofins_csll: 'PIS/COFINS/CSLL', inss: 'INSS', outro: 'Outro',
};

export const CAIXINHA_TIPO_LABEL = { saida: 'Saída', reforco: 'Adição de saldo' };
export const CAIXINHA_STATUS_LABEL = { pendente_aprovacao: 'Aguardando aprovação', aprovado: 'Aprovado', rejeitado: 'Rejeitado' };
// Classe de tom do .status-chip (ver styles.css) por status de movimentação.
export const CAIXINHA_STATUS_TOM = { pendente_aprovacao: 'tone-amber', aprovado: 'tone-good', rejeitado: 'tone-alert' };

export const REGISTRY_DEFS = {
  fornecedores:          { label: 'Fornecedores', custom: 'fornecedor' },
  pagadores:             { label: 'Pagadores (Origem)',      fields: [{ key: 'nome', label: 'Nome', required: true }, { key: 'sigla', label: 'Sigla', required: true }] },
  centros_custo:         { label: 'Centros de custo',        fields: [{ key: 'codigo', label: 'Código', required: true }, { key: 'nome', label: 'Nome', required: true }, { key: 'origem_siglas', label: 'Aplica-se à(s) origem(ns)', type: 'origens' }] },
  classes_conta:         { label: 'Classe da conta',         fields: [{ key: 'codigo', label: 'Código', required: true }, { key: 'nome', label: 'Nome', required: true }, { key: 'centro_custo_id', label: 'Centro de custo', type: 'select-centro', required: true }] },
  codigos_classificacao: { label: 'Código da classificação', fields: [{ key: 'codigo', label: 'Código', required: true }, { key: 'nome', label: 'Descrição', required: true }, { key: 'classe_conta_id', label: 'Classe da conta', type: 'select-classe', required: true }] },
  setores:               { label: 'Departamentos', fields: [{ key: 'nome', label: 'Nome', required: true }, { key: 'pagador_padrao_id', label: 'Pagador padrão (pré-preenchido no recebimento)', type: 'select-pagador' }], restritoA: 'administrador' },
  usuarios:              { label: 'Usuários', custom: 'usuario', restritoA: 'administrador' },
  delegacoes:            { label: 'Delegações', custom: 'delegacao', restritoA: 'super' },
  importar:              { label: 'Importar histórico', custom: 'importar', restritoA: 'administrador' },
  // Armazenamento e Arquivos NÃO ficam aqui -- são sub-abas de
  // Configurações no mesmo nível de Cadastros/Notificações/Meus dados (ver
  // ui_configuracoes.js), não sub-abas de Cadastros.
};

// Estado de navegação/UI no seu valor inicial. Função (e não um objeto
// literal único) porque o logout precisa recriar o estado inteiro: antes o
// logout montava um objeto parcial à mão, e campos como dashboardMes e
// gruposPagadorRecolhidos sumiam -- relogar na mesma aba quebrava a Visão
// geral (mes.split em undefined).
// Filtros de "Todas as notas" salvos no navegador, um conjunto por usuário
// (mesmo computador pode ser usado por mais de uma pessoa). try/catch
// porque localStorage pode estar bloqueado (aba anônima, política do
// navegador) -- aí só não lembra, sem quebrar nada.
const CHAVE_FILTROS = id => `cp_filtros_todas_${id}`;
// Não salva a busca digitada (é pontual) nem o período quando ele é o
// padrão "ano corrente" -- senão, virando o ano, a pessoa continuaria
// presa no ano anterior sem perceber.
export function salvarFiltrosTodas(usuarioId, filtros) {
  const { busca, ...resto } = filtros;
  const ano = new Date().getFullYear();
  if (resto.dataDe === `${ano}-01-01` && resto.dataAte === `${ano}-12-31`) { delete resto.dataDe; delete resto.dataAte; }
  try { window.localStorage.setItem(CHAVE_FILTROS(usuarioId), JSON.stringify(resto)); } catch { /* sem armazenamento */ }
}
export function carregarFiltrosSalvos() {
  if (!app.usuario || app.state.filtrosUsuario === app.usuario.id) return;
  app.state.filtrosUsuario = app.usuario.id;
  try {
    const salvos = JSON.parse(window.localStorage.getItem(CHAVE_FILTROS(app.usuario.id)) || 'null');
    if (salvos && typeof salvos === 'object') Object.assign(app.state.filters, salvos);
  } catch { /* sem armazenamento ou valor inválido: fica o padrão */ }
}

export function estadoInicial() {
  return {
    view: 'minhas', modal: null, modalData: null, flash: null, cadastroTab: 'fornecedores', cadFornecedorBusca: '', recuperandoSenha: false,
    // Aba ativa dentro de "Configurações" (ver ui_configuracoes.js) --
    // Cadastros, Notificações ou Meus dados.
    configTab: 'cadastros',
    // Gaveta lateral do menu mobile (hambúrguer, ver ui_mobile.js) — só
    // exibição, sempre começa fechada, não precisa persistir entre sessões.
    menuMobileAberto: false,
    // Sidebar retrátil no desktop (pedido do dono do produto: quem usa um
    // notebook pequeno + monitor externo quer poder recolher o menu pra
    // ganhar espaço) -- persiste entre sessões porque é uma preferência do
    // dispositivo/monitor, não algo que faz sentido resetar a cada login.
    sidebarRecolhida: (() => { try { return localStorage.getItem('cp_sidebar_recolhida') === '1'; } catch { return false; } })(),
    // Pré-visualização de anexos aberta numa janela à parte (ver
    // events_notas.js) -- só controla o que É RENDERIZADO (o painel
    // inline vira um aviso "aberta em outra janela" em vez dos cards); a
    // referência à janela em si não entra aqui por não ser serializável,
    // fica numa variável de módulo. Sempre começa fechada (nunca
    // persistida -- é o estado de uma janela do sistema operacional, não
    // uma preferência do usuário).
    previewExternoAberto: false,
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
    // Mês (AAAA-MM) usado na aba "Visão geral" pra filtrar por vencimento
    // -- começa no mês atual, mas pode ser trocado (ver ui_dashboard.js).
    dashboardMes: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
    // Departamento: Visão geral do próprio setor ('setor', padrão) ou de
    // todos ('geral'), ver renderDashboard.
    dashboardEscopo: 'setor',
    // Ids de nota com o rateio expandido em "Todas as notas" (mostrando
    // linha a linha) — puramente de exibição, não precisa persistir.
    rateiosExpandidos: new Set(),
    // Ids de pagador com a seção RECOLHIDA em "Lançar no Group" (ver
    // renderQueueLancarGroup em ui.js) — puramente de exibição, mesmo
    // padrão do rateiosExpandidos acima, só que aqui o padrão é começar
    // ABERTO (por isso o Set guarda quem está fechado, não o contrário).
    gruposPagadorRecolhidos: new Set(),
    // Pré-cadastro de fornecedor inline no formulário de nota (ver
    // migration 0030) -- se a área expandida está aberta; começa fechada
    // toda vez que o formulário abre (ver formNovaNota em ui_nota.js).
    preCadastroFornecedorAberto: false,
    // Filtro de período do extrato da caixinha (ver renderExtratoCaixinha
    // em ui_caixinha.js) -- vazio por padrão (mostra o histórico inteiro),
    // diferente do filtro de "Todas as notas" acima porque o volume de
    // movimentação de uma caixinha é bem menor que o de notas.
    caixinhaExtratoFiltro: { dataDe: '', dataAte: '' },
    // "Só saídas aprovadas sem comprovante" na tabela de Movimentações da
    // Caixinha (ver renderCaixinha em ui_caixinha.js) -- relatório de
    // compliance, desligado por padrão.
    caixinhaFiltroSemComprovante: false,
    caixinhaHistoricoFiltro: { dataDe: '', dataAte: '' },
    // Filas (ver renderTabelaNotas em ui.js): busca e ordenação por fila
    // ({ [fila]: texto } / { [fila]: { col, dir } }), notas DESMARCADAS na
    // seleção de ação em lote (guardado aqui e não só no checkbox, senão
    // qualquer redesenho -- digitar na busca -- remarcava tudo) e o painel
    // "Mais filtros" de "Todas as notas".
    filaBusca: {},
    ordem: {},
    lotesDesmarcados: new Set(),
    todasMaisFiltros: false,
    // Id do usuário cujos filtros salvos de "Todas as notas" já foram
    // carregados do navegador (ver carregarFiltrosSalvos em
    // events_notas.js) -- cada usuário tem os seus.
    filtrosUsuario: null,
  };
}

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
  // Controle de acessos (ver migration 0048): catálogo fixo de capacidades
  // + quem tem cada uma. Carregado inteiro no boot (são tabelas pequenas)
  // -- o painel administrativo (ui_configuracoes.js) usa as duas; o resto
  // do app só precisa saber as PRÓPRIAS (ver minhasPermissoesExtras() em
  // state.js), calculado a partir de usuarioPermissoes + app.usuario.id.
  permissoesCatalogo: [],
  usuarioPermissoes: [],
  cadastros: { pagadores: [], centros_custo: [], classes_conta: [], codigos_classificacao: [], fornecedores: [], caixinhas: [], setores: [] },
  notas: [],
  // Movimentações (saída/reforço) de todas as caixinhas -- ver caixinha.js
  // (cálculo de saldo) e ui_caixinha.js/events_caixinha.js.
  caixinhaMovimentacoes: [],
  // Dicas de extração aprendidas por fornecedor (painel "ensinar o
  // leitor", ver aprendizado_extracao.js) -- { fornecedor_id, campo,
  // ancora, valor_exemplo }, uma por (fornecedor, campo).
  extracaoHints: [],
  // Respostas dadas no painel "ensinar o leitor" ANTES de escolher o
  // fornecedor (a ordem do formulário é anexar primeiro) -- ficam em fila
  // aqui e só viram uma dica de verdade (salva por fornecedor) quando o
  // fornecedor é selecionado. { campo, valor, texto }.
  hintsPendentes: [],
  // Fornecedor preenchido sozinho (cruzando o CNPJ lido do documento com o
  // cadastro), sem o usuário ter escolhido -- só controla se o aviso
  // "detectado automaticamente" aparece no campo (ver aoAnalisarNovoAnexo/
  // aoSelecionarFornecedor em events_notas.js). Vira false assim que a
  // pessoa escolhe (ou confirma) um fornecedor pela combo.
  fornecedorAutoDetectado: false,
  // Valores de Número da NF / Valor bruto que a IA preencheu sozinha nesses
  // dois campos (auto-preenchimento ou clique em "Preencher com
  // documento") -- serve de referência pra saber se a pessoa CORRIGIU o
  // que a leitura trouxe (ver verificarCorrecaoEnsinada em
  // events_notas.js), que também vira uma dica aprendida, igual responder
  // uma pergunta do painel "ensinar o leitor". { valor, origemIndice }
  // (índice em anexosAnalises, pra saber de qual texto derivar a âncora)
  // por campo, null se esse campo ainda não veio da IA nesta nota.
  iaValoresPreenchidos: { numeroNota: null, valor: null },
  state: estadoInicial(),
  rateioTemp: [],
  temRateio: false,
  impostoTemp: [],
  temImposto: false,
  // Parcelamento (só em nota nova, ver renderParcelamentoArea/formNovaNota
  // em ui_nota.js): cada linha aqui vira uma NOTA própria ao salvar (não
  // uma linha dentro da mesma nota, como o rateio) -- cada parcela tem seu
  // próprio vencimento e segue o fluxo de aprovação inteiro de forma
  // independente. { id, numero, valor, vencimento }.
  parcelasTemp: [],
  temParcelamento: false,
  fornecedorContasTemp: [],
  // Documento(s) escolhido(s) pro pré-cadastro de fornecedor (mesmo
  // padrão do anexosNovos: File() escolhido mas só enviado de verdade ao
  // confirmar o pré-cadastro).
  preCadastroFornecedorArquivos: [],
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
// Espelha tem_permissao_extra() do banco (migration 0048) -- mesma lógica:
// setor omitido pergunta "tem essa capacidade, em algum escopo?"; setor
// passado pergunta "tem essa capacidade PRA ESSE setor?" (bate com uma
// concessão "Todos", setor null, ou uma concessão exata daquele setor).
export function temPermissaoExtra(chave, setor) {
  if (!app.usuario) return false;
  return app.usuarioPermissoes.some(p =>
    p.usuario_id === app.usuario.id
    && p.permissao_chave === chave
    && (setor === undefined || setor === null || p.setor === null || p.setor === setor)
  );
}
export function podeOperarCadastro() {
  return ehSuperUsuario() || app.papeisEfetivos.includes('contas_a_pagar') || temPermissaoExtra('gerenciar_cadastros');
}
export function ehAdministrador() {
  return app.papeisEfetivos.includes('administrador');
}
// Perfil "recebedor" (ver migration 0029): só relevante pra quem está
// logado de fato como departamento -- delegação não muda isso (quem cobre
// via delegação usa o PRÓPRIO perfil, não o de quem delegou).
export function ehRecebedor() {
  return !!app.usuario && app.usuario.role === 'departamento' && app.usuario.perfil_departamento === 'recebedor';
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
// Texto de ajuda longo: uma linha de resumo à vista e o resto num "Saiba
// mais" que abre e fecha (antes eram parágrafos de 3-6 linhas fixos no
// topo de Arquivos, Armazenamento, Importar e Controle de acessos).
// Os dois argumentos são HTML já pronto (texto fixo do app, não do usuário).
export function saibaMais(resumo, detalhe) {
  return `<div class="ajuda">${resumo} <details class="saiba-mais"><summary>Saiba mais</summary><div>${detalhe}</div></details></div>`;
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
// Sugestão de pagador pelo setor de quem está lançando -- só um valor
// inicial editável (pedido do dono do produto), não uma trava: cobre o
// caso comum de cada setor, mas quem lança pode trocar se o documento for
// de outra origem. Configurável pelo administrador por departamento (ver
// migration 0034 + aba Cadastros → Departamentos) -- não é mais um mapa
// fixo no código.
export function pagadorPadraoParaSetor(setor) {
  const s = (app.cadastros.setores || []).find(x => x.nome === setor);
  return (s && s.pagador_padrao_id) || null;
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
  // Recebedor alternativo (matriz/filial, migration 0054): a conta
  // bancária da nota é a de quem recebe, não a do emissor da NF.
  const recebedor = n.fornecedor_recebedor_id ? app.cadastros.fornecedores.find(f => f.id === n.fornecedor_recebedor_id) : null;
  const recebe = recebedor || fornecedor;
  let contaBancariaLabel = null;
  if (recebe && n.conta_bancaria_id) {
    const c = (recebe.contas || []).find(c => c.id === n.conta_bancaria_id);
    if (c) contaBancariaLabel = `Banco ${c.cod_banco || '—'} · Ag ${c.agencia || '—'} · CC ${c.conta || '—'}`;
  }
  return {
    pagador_label: pagador ? labelOf(pagador) : '—',
    fornecedor_label: fornecedor ? labelOf(fornecedor) : '—',
    centro_custo_label: centro ? labelOf(centro) : null,
    classe_conta_label: classe ? labelOf(classe) : null,
    codigo_classificacao_label: codigo ? labelOf(codigo) : null,
    conta_bancaria_label: contaBancariaLabel,
    recebedor_label: recebedor ? labelOf(recebedor) : null,
    recebedor_cnpj: recebedor ? (recebedor.cnpj || null) : null,
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
