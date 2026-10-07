// src/js/ui.js
import {
  app, SETORES, LIMITE_APROVACAO_GESTOR, ROLE_LABEL, STATUS_LABEL, STEPS, statusLabel,
  REGISTRY_DEFS, escapeHtml, fmtMoney, fmtDate, fmtDateTime, fmtCompetencia, labelOf, selectOptions,
  centrosParaPagador, classesParaCentro, codigosParaClasse, resolverLabelsNota, resolverLabelsRateio, nomeUsuario,
  ehSuperUsuario, podeAgirComo, ehRecebedor, carregarFiltrosSalvos,
} from './state.js';
import { renderModal, renderModalPagina, FULL_PAGE_MODALS } from './ui_modal.js';
import { renderDashboard } from './ui_dashboard.js';
import { renderConfiguracoes } from './ui_configuracoes.js';
import { renderCaixinha } from './ui_caixinha.js';
import { ICON_MARK_SVG, ICON_MARK_SVG_TRANSPARENT } from './brand.js';
import { icon } from './icons.js';
import { ehMobile } from './device.js';
import { statusPrazo } from './prazo_despesa.js';

// Badge de prazo do chamado (D+X a partir de data_chamado, ver
// prazo_despesa.js) -- só aparece enquanto o CSC ainda não pagou/cancelou,
// e só depois que o chamado foi de fato aberto (antes disso não há prazo).
function prazoBadgeCard(n) {
  if (!n.data_chamado || n.status === 'pago' || n.status === 'cancelada') return '';
  const st = statusPrazo(n.tipo_despesa_prazo, n.data_chamado);
  if (!st) return '';
  return st.atrasado
    ? `<div class="pend-badge">${icon('alerta')} Atrasado ${Math.abs(st.diasRestantes)}d</div>`
    : `<div class="pend-badge muted">Prazo: ${st.diasRestantes}d</div>`;
}

/* ================= AUTH SCREEN ================= */
// Cadastro fechado: não existe mais aba "Cadastrar" — só um administrador
// cria conta (Cadastros → Usuários). O que sobra aqui é login e
// recuperação de senha (usada também pelo convidado, na primeira vez).
export let authTab = 'login';
export let authError = '';
export let authInfo = '';
export function setAuthTab(t) { authTab = t; }
export function setAuthError(e) { authError = e; authInfo = ''; }
export function setAuthInfo(i) { authInfo = i; authError = ''; }

export function renderAuth() {
  return `
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="auth-logo"><span class="mark">${ICON_MARK_SVG}</span><h1>Central</h1></div>
      <p class="auth-sub">Controle de contas a pagar entre setores</p>
      ${authError ? `<div class="err-msg">${escapeHtml(authError)}</div>` : ''}
      ${authInfo ? `<div class="flash">${escapeHtml(authInfo)}</div>` : ''}
      ${authTab === 'login' ? `
        <div id="box-login">
          <div class="field"><label>E-mail</label><input id="login-email" type="email" required></div>
          <div class="field"><label>Senha</label><input type="password" id="login-password" required></div>
          <button class="btn btn-brand btn-block" type="button" id="btn-do-login">Entrar</button>
          <p style="text-align:center; margin-top:14px;"><a href="#" data-tab="recuperar" style="font-size:13px;">Esqueci minha senha / primeiro acesso</a></p>
        </div>
      ` : `
        <div id="box-recuperar">
          <p class="field-hint mb-3">Informe o e-mail cadastrado — vamos mandar um link pra você definir a senha.</p>
          <div class="field"><label>E-mail</label><input id="recuperar-email" type="email" required></div>
          <button class="btn btn-brand btn-block" type="button" id="btn-do-recuperar">Enviar link</button>
          <p style="text-align:center; margin-top:14px;"><a href="#" data-tab="login" style="font-size:13px;">Voltar para o login</a></p>
        </div>
      `}
    </div>
  </div>`;
}

// Tela que abre quando o usuário clica no link do e-mail de definir/
// redefinir senha (evento PASSWORD_RECOVERY do Supabase Auth).
export function renderDefinirSenha() {
  return `
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="auth-logo"><span class="mark">${ICON_MARK_SVG}</span><h1>Central</h1></div>
      <p class="auth-sub">Defina sua senha de acesso</p>
      ${authError ? `<div class="err-msg">${escapeHtml(authError)}</div>` : ''}
      <div class="field"><label>Nova senha (mínimo 6 caracteres)</label><input type="password" id="nova-senha" required></div>
      <div class="field"><label>Confirme a nova senha</label><input type="password" id="nova-senha-confirma" required></div>
      <button class="btn btn-brand btn-block" type="button" id="btn-definir-senha">Salvar senha e entrar</button>
    </div>
  </div>`;
}

/* ================= SHELL / NAV ================= */
// As 4 etapas do contas a pagar — cada uma vira uma aba própria (item #6 do
// pedido do usuário), com as notas agrupadas por pagador + vencimento porque
// é assim que os chamados são abertos no Acelerato (um chamado por
// pagador+data de vencimento, podendo juntar várias notas).
export const CP_STAGE_META = {
  lancar_group: {
    statusFiltro: 'aprovado', titulo: 'Lançar no Group',
    sub: 'Notas aprovadas, prontas para o lançamento no Group.',
    modal: 'lote_lancar_group', acaoLabel: 'Lançar no Group',
  },
  abrir_chamado: {
    statusFiltro: 'lancado_no_group', titulo: 'Abrir chamado',
    sub: 'Já lançadas no Group — falta abrir o chamado no Acelerato.',
    modal: 'lote_abrir_chamado', acaoLabel: 'Abrir chamado',
  },
  validar_csc: {
    statusFiltro: 'chamado_aberto', titulo: 'Validar CSC',
    sub: 'Chamados abertos no Acelerato, aguardando validação do CSC.',
    modal: 'lote_validar_csc', acaoLabel: 'Validar CSC',
  },
  confirmar_pagamento: {
    statusFiltro: 'validado_csc', titulo: 'Confirmar pagamento',
    sub: 'Validadas pelo CSC, aguardando a confirmação do pagamento.',
    modal: 'lote_confirmar_pagamento', acaoLabel: 'Confirmar pagamento',
  },
};

// Nota "atrasada" pra fins do contador do menu: vencimento já passou (e
// ainda não foi paga/cancelada) ou o prazo do CSC estourou.
function notaAtrasada(n) {
  if (n.status === 'pago' || n.status === 'cancelada') return false;
  const d = new Date();
  const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (n.vencimento && n.vencimento < hoje) return true;
  const st = n.data_chamado ? statusPrazo(n.tipo_despesa_prazo, n.data_chamado) : null;
  return !!(st && st.atrasado);
}

// Item do menu a partir da LISTA da fila: count = tamanho, alerta = alguma
// nota atrasada nela (o contador fica âmbar só nesse caso; nos outros é
// neutro, e some quando a fila está vazia -- ver renderNavItens).
function itemFila(key, label, secao, list) {
  return { key, label, secao, count: list.length, alerta: list.some(notaAtrasada) };
}

// Menu lateral em SEÇÕES (Minha fila / Esteira / Consultas), em vez de uma
// lista corrida de 12-14 itens. A `secao` de cada item vira o título que
// aparece acima do grupo (ver renderNavItens); Visão geral e
// Configurações ficam sem título, no topo e no fim.
export function navItemsFor(usuario) {
  const rascunhos = app.notas.filter(n => podeAgirComo(n.criado_por) && (n.status === 'rascunho' || n.status === 'rascunho_recebimento'));
  const esteira = () => [
    itemFila('lancar_group', 'Lançar no Group', 'Esteira', app.notas.filter(n => n.status === 'aprovado' && !n.pendente && !fornecedorPendente(n))),
    { key: 'cadastrar_fornecedor', label: 'Cadastrar fornecedor', secao: 'Esteira', count: fornecedoresPreCadastroComNotas().length, alerta: false },
    itemFila('abrir_chamado', 'Abrir chamado', 'Esteira', app.notas.filter(n => n.status === 'lancado_no_group' && !n.pendente)),
    itemFila('validar_csc', 'Validar CSC', 'Esteira', app.notas.filter(n => n.status === 'chamado_aberto' && !n.pendente)),
    itemFila('confirmar_pagamento', 'Confirmar pagamento', 'Esteira', app.notas.filter(n => n.status === 'validado_csc' && !n.pendente)),
  ];
  // Histórico de cancelamentos: consulta, não fila de trabalho -- por isso
  // sem contador. Só quem cancela (contas_a_pagar/super_usuário) tem.
  const cancelados = { key: 'cancelados', label: 'Cancelados', secao: 'Consultas', count: null };
  let base;
  // administrador/gerente_financeiro (ou quem estiver cobrindo um deles por
  // delegação) têm acesso total: aprovam E também executam as 4 etapas do
  // contas a pagar, vendo tudo (sem recorte de setor).
  if (ehSuperUsuario()) base = [
    { key: 'dashboard', label: 'Visão geral', secao: null, count: null },
    // Rascunhos próprios -- só assim dá pra achar de volta um rascunho
    // salvo (ele não aparece em nenhuma outra fila, nem em "Todas").
    itemFila('rascunhos', 'Rascunhos', 'Minha fila', rascunhos),
    itemFila('recebidos', 'Recebidos', 'Minha fila', app.notas.filter(n => n.status === 'recebido')),
    itemFila('pendencias', 'Pendências', 'Minha fila', app.notas.filter(n => n.pendente)),
    itemFila('aprovacao', 'Aguardando aprovação', 'Esteira', app.notas.filter(n => n.status === 'lancado' && !n.pendente)),
    ...esteira(),
    { key: 'todas', label: 'Todas as notas', secao: 'Consultas', count: null },
    cancelados,
  ];
  else if (usuario.role === 'departamento') base = [
    // "Visão geral" também pra departamento -- todos os perfis acompanham
    // o mesmo indicador de vencimentos do mês (ver ui_dashboard.js).
    { key: 'dashboard', label: 'Visão geral', secao: null, count: null },
    // "Minhas notas" é consulta do que a pessoa lançou (não fila de
    // trabalho) -- sem contador, que só repetia o total de notas dela.
    { key: 'minhas', label: 'Minhas notas', secao: 'Minha fila', count: null },
    itemFila('rascunhos', 'Rascunhos', 'Minha fila', rascunhos),
    // "Recebidos": fila do SETOR inteiro (perfil recebedor/completo, ver
    // migration 0029), não só o que a própria pessoa criou.
    itemFila('recebidos', 'Recebidos', 'Minha fila', app.notas.filter(n => n.status === 'recebido' && n.setor === usuario.setor)),
    itemFila('pendencias', 'Pendências', 'Minha fila', app.notas.filter(n => podeAgirComo(n.criado_por) && n.pendente)),
    { key: 'todas', label: 'Todas as notas', secao: 'Consultas', count: null },
  ];
  else base = [
    { key: 'dashboard', label: 'Visão geral', secao: null, count: null },
    // contas_a_pagar também lança nota (só pro setor Financeiro, ver
    // 0024_cp_lanca_para_financeiro_e_todas_notas_geral.sql) -- precisa
    // achar de volta um rascunho salvo, mesma razão do super_usuário.
    itemFila('rascunhos', 'Rascunhos', 'Minha fila', rascunhos),
    itemFila('pendencias', 'Pendências', 'Minha fila', app.notas.filter(n => n.pendente)),
    ...esteira(),
    { key: 'todas', label: 'Todas as notas', secao: 'Consultas', count: null },
    cancelados,
  ];
  // Caixinha (fundo fixo): todo mundo participa -- o contador é o que está
  // aguardando aprovação (ver ui_caixinha.js).
  base.push({ key: 'caixinha', label: 'Caixinha', secao: 'Consultas', count: app.caixinhaMovimentacoes.filter(m => m.status === 'pendente_aprovacao').length, alerta: false });
  // Cadastros, notificações, dados do próprio usuário -- tudo numa única
  // "Configurações" (ver ui_configuracoes.js). A key continua 'cadastros'
  // de propósito: é o data-view que a suíte de testes inteira já usa.
  base.push({ key: 'cadastros', label: 'Configurações', secao: 'Sistema', count: null });
  return base;
}

// Ícone de cada item do menu -- aparece ao lado do rótulo e é o que sobra
// quando a barra está recolhida (trilho de ícones, ver .sidebar.recolhida).
const ICONE_VIEW = {
  dashboard: 'painel', minhas: 'arquivo', rascunhos: 'rascunho', recebidos: 'entrada', pendencias: 'pendencia',
  aprovacao: 'aprovar', lancar_group: 'enviar', cadastrar_fornecedor: 'usuarioMais', abrir_chamado: 'ticket',
  validar_csc: 'escudo', confirmar_pagamento: 'cartao', todas: 'lista', cancelados: 'cancelado',
  caixinha: 'carteira', cadastros: 'engrenagem',
};

// Itens do menu agrupados por seção -- usado pela sidebar do desktop e pela
// gaveta do celular (mesmos data-view, mesmo wiring em events_shell.js).
// Contador: some quando é zero; âmbar quando a fila tem nota atrasada.
// O rótulo também vai no title: com a barra recolhida, é a dica do ícone.
export function renderNavItens(nav) {
  let secaoAtual;
  return nav.map(it => {
    const titulo = it.secao && it.secao !== secaoAtual ? `<div class="nav-secao">${it.secao}</div>` : '';
    secaoAtual = it.secao;
    const count = it.count ? `<span class="count ${it.alerta ? 'alerta' : ''}" ${it.alerta ? 'title="Tem nota atrasada nesta fila"' : ''}>${it.count}</span>` : '';
    return `${titulo}
      <button data-view="${it.key}" class="${app.state.view === it.key ? 'active' : ''}" title="${it.label}${it.count ? ` (${it.count})` : ''}">
        ${ICONE_VIEW[it.key] ? icon(ICONE_VIEW[it.key]) : ''}<span class="nav-label">${it.label}</span>${count}
      </button>`;
  }).join('');
}

const iniciais = (nome) => String(nome || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('') || '?';

export function renderShell() {
  const usuario = app.usuario;
  const nav = navItemsFor(usuario);
  // Formulário de nota e detalhe (ver FULL_PAGE_MODALS) ocupam a área
  // principal inteira, como qualquer outra tela — só as ações rápidas
  // (aprovar, marcar pendência, ações em lote, cadastros) continuam como
  // uma janela pequena por cima do que já estava na tela.
  const modalEhPagina = app.state.modal && FULL_PAGE_MODALS.has(app.state.modal);
  const recolhida = !!app.state.sidebarRecolhida;
  return `
  <div class="shell${recolhida ? ' sb-recolhida' : ''}">
    <div class="sidebar${recolhida ? ' recolhida' : ''}">
      <div class="sb-logo"><span class="mark">${ICON_MARK_SVG_TRANSPARENT}</span><span class="sb-logo-nome">Central</span></div>
      <div class="sb-user">
        <div class="sb-avatar" title="${escapeHtml(usuario.nome)}" aria-hidden="true">${escapeHtml(iniciais(usuario.nome))}</div>
        <div class="sb-user-info">
          <div class="name">${escapeHtml(usuario.nome)}</div>
          <div class="sb-user-papel">${ROLE_LABEL[usuario.role]}${usuario.setor ? ' · ' + escapeHtml(usuario.setor) : ''}</div>
        </div>
        <div class="sb-user-acoes">
          <button type="button" class="sb-icone" id="btn-refresh" title="Atualizar dados" aria-label="Atualizar dados">${icon('atualizar')}</button>
          <button type="button" class="sb-icone" id="btn-logout" title="Sair" aria-label="Sair">${icon('sair')}</button>
        </div>
      </div>
      <div class="sb-nav">${renderNavItens(nav)}</div>
      <div class="sb-bottom">
        ${ehRecebedor() ? `<button class="btn btn-amber btn-block sb-acao" id="btn-novo-recebimento" title="Anexar documento">${icon('clipe')}<span class="sb-acao-label">Anexar documento</span></button>` : `
        ${(usuario.role === 'departamento' || usuario.role === 'contas_a_pagar' || ehSuperUsuario()) ? `<button class="btn btn-amber btn-block sb-acao" id="btn-nova-nota" title="Nova nota">${icon('mais')}<span class="sb-acao-label">Nova nota</span></button>` : ''}
        ${(usuario.role === 'departamento' || ehSuperUsuario()) ? `<button class="btn btn-ghost-dark btn-block sb-acao" id="btn-lote-nota" title="Lançar em lote">${icon('camadas')}<span class="sb-acao-label">Lançar em lote</span></button>` : ''}
        `}
        <button type="button" id="btn-sidebar-toggle" class="sb-toggle" title="${recolhida ? 'Expandir menu' : 'Recolher menu'}" aria-label="${recolhida ? 'Expandir menu' : 'Recolher menu'}">${icon(recolhida ? 'chevronDireita' : 'chevronEsquerda')}<span class="sb-acao-label">${recolhida ? 'Expandir menu' : 'Recolher menu'}</span></button>
      </div>
    </div>
    <div class="main">
      ${app.state.flash ? `<div class="flash">${escapeHtml(app.state.flash)}</div>` : ''}
      ${modalEhPagina ? renderModalPagina() : renderMain()}
    </div>
  </div>
  ${(app.state.modal && !modalEhPagina) ? renderModal() : ''}
  `;
}

export function renderMain() {
  // "Visão geral" agora é de todos os perfis (departamento incluído) --
  // antes era só de quem opera a esteira inteira.
  if (app.state.view === 'dashboard') return renderDashboard();
  if (app.state.view === 'cadastros') return renderConfiguracoes();
  if (app.state.view === 'todas') return renderTodas();
  if (app.state.view === 'caixinha') return renderCaixinha();
  // Aprovação em lote (pedido do dono do produto): só quem aprova
  // (gerente_financeiro/administrador) tem essa fila -- reaproveita o
  // mesmo mecanismo de checkbox + data-lote-action/data-lote-group do
  // contas a pagar (ver renderGrupoCard acima), só que num grupo único
  // (não agrupado por pagador+vencimento -- aprovação é por nota, não por
  // um evento externo que junta várias de uma vez).
  if (ehSuperUsuario() && app.state.view === 'aprovacao') return renderQueueAprovacao();
  if (app.usuario.role === 'contas_a_pagar' || ehSuperUsuario()) {
    // "Lançar no Group" é diferente dos outros 3 estágios: cada nota tem
    // um código PRÓPRIO no Group, não um código só pra várias notas de
    // uma vez -- por isso não agrupa por pagador+vencimento nem tem ação
    // em lote, cada nota lança individualmente (decisão do dono do
    // produto). Os outros 3 continuam agrupados (ali um chamado/validação/
    // pagamento de verdade cobre várias notas ao mesmo tempo).
    if (app.state.view === 'lancar_group') return renderQueueLancarGroup();
    if (app.state.view === 'cadastrar_fornecedor') return renderQueueCadastrarFornecedor();
    if (CP_STAGE_META[app.state.view]) return renderQueueGrouped(app.state.view);
  }
  if (VIEW_META[app.state.view]) return renderQueue(app.state.view);
  return renderQueue(app.usuario.role === 'departamento' ? 'minhas' : 'pendencias');
}

const VIEW_META = {
  minhas:     { title: 'Minhas notas', sub: 'Notas que você lançou no Central CP' },
  rascunhos:  { title: 'Rascunhos', sub: 'Notas salvas como rascunho, ainda não enviadas para aprovação' },
  recebidos:  { title: 'Recebidos', sub: 'Documentos anexados pelo perfil recebedor, aguardando alguém completar o lançamento (ou corrigir uma devolução)' },
  aprovacao:  { title: 'Aguardando aprovação', sub: 'Notas de todos os setores, esperando aprovação' },
  pendencias: { title: 'Pendências', sub: 'Notas com alguma divergência aberta, aguardando ajuste do departamento responsável' },
  cancelados: { title: 'Lançamentos cancelados', sub: 'Notas canceladas (ver "Cancelar lançamento" no detalhe da nota) -- mantidas aqui só para consulta e auditoria, o cancelamento não pode ser revertido' },
};

// Pré-cadastro de fornecedor (ver migration 0030/ui_nota.js): o
// departamento "completo" cria o fornecedor direto no formulário de nota
// quando não acha ele no combo, só com nome/CNPJ + documento -- fica
// status='pre_cadastro' até o CP revisar, completar e cadastrar de
// verdade no Group. Enquanto isso, a nota fica de fora de "Lançar no
// Group" (não existe código de Group pra apontar ainda).
function fornecedorPendente(n) {
  const f = app.cadastros.fornecedores.find(x => x.id === n.fornecedor_id);
  return !!f && f.status === 'pre_cadastro';
}
// Fornecedores aguardando validação, cada um com a lista de notas paradas
// por causa dele -- usado tanto pelo contador da aba quanto pelo conteúdo
// dela (ver renderQueueCadastrarFornecedor).
export function fornecedoresPreCadastroComNotas() {
  return app.cadastros.fornecedores
    .filter(f => f.status === 'pre_cadastro')
    .map(f => ({ fornecedor: f, notas: app.notas.filter(n => n.fornecedor_id === f.id && n.status !== 'rascunho' && n.status !== 'rascunho_recebimento') }));
}

function queueData(key) {
  const u = app.usuario;
  if (key === 'minhas') return app.notas.filter(n => podeAgirComo(n.criado_por) && n.status !== 'rascunho' && n.status !== 'rascunho_recebimento');
  if (key === 'rascunhos') return app.notas.filter(n => podeAgirComo(n.criado_por) && (n.status === 'rascunho' || n.status === 'rascunho_recebimento'));
  // "Recebidos": fila do setor inteiro pra departamento (não só o que a
  // própria pessoa criou -- "qualquer recebedor pode resolver", decisão do
  // dono do produto); super_usuario já vê tudo, sem recorte de setor.
  if (key === 'recebidos') return (!ehSuperUsuario() && u.role === 'departamento')
    ? app.notas.filter(n => n.status === 'recebido' && n.setor === u.setor)
    : app.notas.filter(n => n.status === 'recebido');
  if (key === 'aprovacao') return app.notas.filter(n => n.status === 'lancado' && !n.pendente);
  // Pendência é do SETOR da nota, não só de quem lançou -- mesmo
  // raciocínio de "recebidos" acima ("qualquer um do setor resolve",
  // decisão do dono do produto; ver migration 0042). contas_a_pagar segue
  // vendo todas (comportamento de sempre, sem recorte).
  if (key === 'pendencias') return (!ehSuperUsuario() && u.role === 'departamento')
    ? app.notas.filter(n => n.pendente && (n.setor === u.setor || podeAgirComo(n.criado_por)))
    : app.notas.filter(n => n.pendente);
  // "Lançar no Group": some com as notas cujo fornecedor ainda está em
  // pré-cadastro -- elas ficam na aba "Cadastrar fornecedor" até o CP
  // validar (ver fornecedorPendente acima).
  if (key === 'lancar_group') return app.notas.filter(n => n.status === 'aprovado' && !n.pendente && !fornecedorPendente(n));
  if (key === 'cancelados') return app.notas.filter(n => n.status === 'cancelada');
  if (CP_STAGE_META[key]) return app.notas.filter(n => n.status === CP_STAGE_META[key].statusFiltro && !n.pendente);
  return app.notas.filter(n => n.status !== 'rascunho' && n.status !== 'rascunho_recebimento');
}

function buscaDaFila(ctx) {
  return (app.state.filaBusca && app.state.filaBusca[ctx]) || '';
}

// Fila vazia de verdade x busca que não achou nada -- mensagens diferentes.
function vazioDaFila(ctx) {
  return buscaDaFila(ctx)
    ? `<div class="empty-state">Nenhuma nota encontrada para "${escapeHtml(buscaDaFila(ctx))}".</div>`
    : `<div class="empty-state">Nenhuma nota aqui no momento.</div>`;
}

// Altura máxima da tabela de cada grupo quando há VÁRIOS grupos na tela
// (cerca de 12 linhas). Com um grupo só, ela ocupa o resto da janela, como
// a tabela de uma fila comum (sem rolagem dupla, tabela + página).
const ALTURA_GRUPO = 560;

// Colunas por fila: em "Minhas notas"/"Rascunhos" o solicitante é sempre a
// própria pessoa; em "Recebidos" a nota ainda não tem valor nem vencimento
// (o recebedor só anexa e classifica) e a fila inteira é "Recebido --
// aguarda complementação", então essas colunas só repetiam "—", "R$ 0,00"
// e a mesma etiqueta em toda linha (a de pendência continua aparecendo).
function opcoesDaFila(key) {
  if (key === 'minhas' || key === 'rascunhos') return { ocultar: ['solicitante'] };
  if (key === 'recebidos') return { ocultar: ['vencimento', 'valor'], semStatusBase: true };
  return {};
}

function renderQueue(key) {
  const meta = VIEW_META[key];
  const list = filtrarBuscaFila(queueData(key), buscaDaFila(key));
  return `
    <div class="topbar"><div><h2>${meta.title}</h2><p class="sub">${meta.sub}</p></div></div>
    ${filaToolbar(key, list, key === 'recebidos')}
    ${list.length === 0 ? vazioDaFila(key) : renderTabelaNotas(list, { id: `fila-${key}`, ctx: key, ...opcoesDaFila(key) })}
  `;
}

// Agrupa por pagador + data de vencimento — é assim que o contas a pagar
// abre os chamados no Acelerato (um chamado por pagador+vencimento, podendo
// juntar várias notas de uma vez), então a UI reflete esse agrupamento e
// oferece uma ação em lote por grupo em vez de nota por nota.
function groupByPagadorVencimento(list) {
  const map = new Map();
  list.forEach(n => {
    const key = (n.pagador_id || '—') + '|' + (n.vencimento || '—');
    if (!map.has(key)) map.set(key, { key, pagador_id: n.pagador_id, vencimento: n.vencimento, notas: [] });
    map.get(key).notas.push(n);
  });
  return Array.from(map.values()).sort((a, b) => new Date(a.vencimento || 0) - new Date(b.vencimento || 0));
}

// A ação em lote parte com todas as notas do grupo marcadas, mas cada uma
// tem um checkbox — dá pra desmarcar as que não devem entrar nesse
// lançamento/chamado específico (ex: uma nota do grupo ainda não tem o
// boleto em mãos). O clique no botão lê os checkboxes marcados na hora,
// não a lista fixa do grupo inteiro.
function renderGrupoCard(g, stageKey, varios) {
  const meta = CP_STAGE_META[stageKey];
  const pagador = app.cadastros.pagadores.find(p => p.id === g.pagador_id);
  const total = g.notas.reduce((s, n) => s + (Number(n.valor_bruto) || 0), 0);
  // g.key é montado só a partir de pagador_id (uuid) + vencimento (data
  // iso) — dado interno, não texto livre de usuário, por isso vai direto
  // no atributo sem passar por escapeHtml (que é pra texto de exibição).
  const keyAttr = g.key;
  const selecionadas = g.notas.filter(n => !app.state.lotesDesmarcados.has(n.id)).length;
  return `
  <div class="grupo-card">
    <div class="grupo-header">
      <div>
        <div class="grupo-title">${escapeHtml(pagador ? labelOf(pagador) : '—')} <span class="grupo-title-venc">· vencimento ${fmtDate(g.vencimento)}</span></div>
        <div class="grupo-sub">${g.notas.length} nota${g.notas.length === 1 ? '' : 's'} · Total ${fmtMoney(total)}</div>
        <div class="grupo-select-links">
          <a href="#" data-grupo-select-all="${keyAttr}">Selecionar todas</a> · <a href="#" data-grupo-select-none="${keyAttr}">Nenhuma</a>
        </div>
      </div>
      <button class="btn btn-brand btn-sm" data-lote-action="${meta.modal}" data-lote-group="${keyAttr}" ${selecionadas === 0 ? 'disabled' : ''}><span>${meta.acaoLabel} (<span data-grupo-count="${keyAttr}">${selecionadas}</span>)</span></button>
    </div>
    ${renderTabelaNotas(g.notas, { id: `grupo-${keyAttr}`, ctx: stageKey, selecao: keyAttr, ocultar: ['pagador', 'vencimento'], alturaMax: varios ? ALTURA_GRUPO : undefined })}
  </div>`;
}

function renderQueueGrouped(key) {
  const meta = CP_STAGE_META[key];
  const list = filtrarBuscaFila(queueData(key), buscaDaFila(key));
  const groups = groupByPagadorVencimento(list);
  return `
    <div class="topbar"><div><h2>${meta.titulo}</h2><p class="sub">${meta.sub}</p></div></div>
    ${filaToolbar(key, list)}
    ${groups.length === 0 ? vazioDaFila(key) : groups.map(g => renderGrupoCard(g, key, groups.length > 1)).join('')}
  `;
}

// "Aguardando aprovação": um grupo único (não por pagador+vencimento --
// aprovar é um julgamento por nota, não um evento externo que naturalmente
// junta várias) com checkbox por nota, reaproveitando o mesmo mecanismo
// genérico de seleção/contagem/lote já usado pelos grupos de
// pagador+vencimento acima (.grupo-check/[data-grupo-select-all]/
// [data-lote-action][data-lote-group], todos amarrados em
// attachNotaListHandlers de events_notas.js) -- por isso não precisa de
// nenhum wiring novo, só o HTML na mesma forma.
function renderQueueAprovacao() {
  const meta = VIEW_META.aprovacao;
  const list = filtrarBuscaFila(queueData('aprovacao'), buscaDaFila('aprovacao'));
  const key = 'aprovacao-lote';
  const selecionadas = list.filter(n => !app.state.lotesDesmarcados.has(n.id)).length;
  return `
    <div class="topbar"><div><h2>${meta.title}</h2><p class="sub">${meta.sub}</p></div></div>
    ${filaToolbar('aprovacao', list)}
    ${list.length === 0 ? vazioDaFila('aprovacao') : `
    <div class="grupo-card">
      <div class="grupo-header">
        <div>
          <div class="grupo-title">Aprovação em lote</div>
          <div class="grupo-select-links">
            <a href="#" data-grupo-select-all="${key}">Selecionar todas</a> · <a href="#" data-grupo-select-none="${key}">Nenhuma</a>
          </div>
        </div>
        <button class="btn btn-brand btn-sm" data-lote-action="lote_aprovar" data-lote-group="${key}" ${selecionadas === 0 ? 'disabled' : ''}><span>Aprovar selecionadas (<span data-grupo-count="${key}">${selecionadas}</span>)</span></button>
      </div>
      ${renderTabelaNotas(list, { id: 'fila-aprovacao', ctx: 'aprovacao', selecao: key })}
    </div>`}
  `;
}

// Organiza uma lista de notas em seções por pagador (ordenadas pelo nome
// do pagador, notas de cada seção por vencimento) -- só pra exibição, sem
// juntar em nenhum objeto de grupo com ação em lote (ver renderGrupoCard
// acima, que é outra coisa: agrupa por pagador+vencimento pra abrir
// chamado/lançar em lote). Aqui é só pra achar mais rápido as notas de um
// mesmo pagador na fila, útil quando ela cresce.
function agruparPorPagadorParaExibicao(list) {
  const map = new Map();
  list.forEach(n => {
    const key = n.pagador_id || '—';
    if (!map.has(key)) map.set(key, { pagador_id: n.pagador_id, notas: [] });
    map.get(key).notas.push(n);
  });
  const grupos = Array.from(map.values());
  grupos.forEach(g => g.notas.sort((a, b) => new Date(a.vencimento || 0) - new Date(b.vencimento || 0)));
  grupos.sort((a, b) => {
    const pa = app.cadastros.pagadores.find(p => p.id === a.pagador_id);
    const pb = app.cadastros.pagadores.find(p => p.id === b.pagador_id);
    return (pa ? labelOf(pa) : '').localeCompare(pb ? labelOf(pb) : '');
  });
  return grupos;
}

// "Lançar no Group": organizada por pagador (pedido do dono do produto),
// mas sem agrupar por pagador+vencimento nem ação em lote -- cada nota tem
// um código PRÓPRIO no Group. Sem botão ao lado do card (pedido do dono do
// produto: já é redundante -- clicar no card abre o detalhe, que já tem
// esse mesmo botão de ação lá dentro, ver STAGE_ACTION_BY_STATUS em
// ui_nota.js).
function renderQueueLancarGroup() {
  const meta = CP_STAGE_META.lancar_group;
  const list = filtrarBuscaFila(queueData('lancar_group'), buscaDaFila('lancar_group'));
  const grupos = agruparPorPagadorParaExibicao(list);
  return `
    <div class="topbar"><div><h2>${meta.titulo}</h2><p class="sub">${meta.sub}</p></div></div>
    ${filaToolbar('lancar_group', list)}
    ${grupos.length === 0 ? vazioDaFila('lancar_group') : grupos.map(g => {
      const pagador = app.cadastros.pagadores.find(p => p.id === g.pagador_id);
      const chave = g.pagador_id || 'sem-pagador';
      // Começa aberto (padrão mais útil pra fila pequena) -- só entra pro
      // Set quando o usuário recolhe de propósito, ver toggle em
      // events_notas.js/attachNotaListHandlers.
      const recolhido = app.state.gruposPagadorRecolhidos.has(chave);
      return `
      <h3 class="form-section-title grupo-pagador-title" data-toggle-grupo-pagador="${chave}">
        ${icon(recolhido ? 'chevronDireita' : 'chevronBaixo')}
        ${escapeHtml(pagador ? labelOf(pagador) : '—')} <span class="grupo-pagador-resumo">${resumoFila(g.notas)}</span>
      </h3>
      ${recolhido ? '' : renderTabelaNotas(g.notas, { id: `group-${chave}`, ctx: 'lancar_group', ocultar: ['pagador'], alturaMax: grupos.length > 1 ? ALTURA_GRUPO : undefined, ordemPadrao: { col: 'vencimento', dir: 'asc' } })}`;
    }).join('')}
  `;
}

// "Cadastrar fornecedor" (só CP/super_usuario): um fornecedor pré-
// cadastrado pelo departamento pode ter várias notas esperando por ele --
// por isso a fila é de FORNECEDORES, não de notas (validar uma vez libera
// todas as notas dele de uma só vez).
function renderQueueCadastrarFornecedor() {
  const pendentes = fornecedoresPreCadastroComNotas();
  return `
    <div class="topbar"><div><h2>Cadastrar fornecedor</h2><p class="sub">Fornecedores pré-cadastrados pelo departamento no lançamento da nota, aguardando revisão e cadastro no Group</p></div></div>
    ${pendentes.length === 0 ? `<div class="empty-state">Nenhum pré-cadastro pendente no momento.</div>` : pendentes.map(({ fornecedor: f, notas }) => `
      <div class="grupo-card">
        <div class="grupo-header">
          <div>
            <div class="grupo-title">${escapeHtml(f.nome)}${f.cnpj ? ` · <span class="mono">${escapeHtml(f.cnpj)}</span>` : ''}</div>
            <div class="grupo-sub">Pré-cadastrado por ${escapeHtml(nomeUsuario(f.pre_cadastrado_por))} · ${notas.length} nota(s) aguardando</div>
            ${(f.documentos_pre_cadastro || []).length > 0 ? `<div class="grupo-select-links">${f.documentos_pre_cadastro.map(p => `<a href="#" data-baixar-documento-fornecedor="${p}">Ver documento</a>`).join(' · ')}</div>` : `<div class="field-hint">Nenhum documento anexado.</div>`}
          </div>
          <button class="btn btn-brand btn-sm" data-validar-fornecedor="${f.id}">Validar e ativar</button>
        </div>
        ${renderTabelaNotas(notas, { id: `forn-${f.id}`, ctx: 'cadastrar_fornecedor', ocultar: ['fornecedor'], alturaMax: 360 })}
      </div>`).join('')}
  `;
}

// ---------------------------------------------------------------------
// Filas em tabela compacta (uma linha por nota) -- no lugar do cartão alto
// com a esteira inteira desenhada em cada nota. Mesmo componente pra todas
// as filas; o que muda por fila vem em `opts`:
//   id        -> data-tbl-fixa (padrão de tabela fixa, ver tabelas_fixas.js)
//   ctx       -> chave da ordenação/busca guardada em app.state
//   selecao   -> chave do grupo de checkboxes (ação em lote), se houver
//   ocultar   -> colunas já ditas no cabeçalho do grupo (pagador,
//                vencimento, fornecedor) -- não repetem em cada linha
//   alturaMax -> altura fixa quando há várias tabelas empilhadas na tela
// No celular continua a lista de cartões (tela estreita demais pra 7
// colunas; o cartão do celular é revisto na fase própria).
// ---------------------------------------------------------------------
const ORDENADORES = {
  fornecedor: n => resolverLabelsNota(n).fornecedor_label || '',
  nf: n => n.numero_nota || '',
  emissao: n => n.data_emissao || '',
  vencimento: n => n.vencimento || '',
  competencia: n => n.competencia || '',
  valor: n => Number(n.valor_bruto) || 0,
  pagador: n => resolverLabelsNota(n).pagador_label || '',
  centro: n => n.tem_rateio ? '\uffff' : (resolverLabelsNota(n).centro_custo_label || ''),
  status: n => { const i = STEPS.indexOf(n.status); return i === -1 ? 99 : i; },
  setor: n => n.setor || '',
  solicitante: n => nomeUsuario(n.criado_por) || '',
  criado: n => n.criado_em || '',
};

export function ordenarNotas(list, ordem) {
  const chave = ORDENADORES[ordem && ordem.col];
  if (!chave) return list;
  const sinal = ordem.dir === 'desc' ? -1 : 1;
  return [...list].sort((a, b) => {
    const x = chave(a), y = chave(b);
    const c = (typeof x === 'number' && typeof y === 'number') ? x - y : String(x).localeCompare(String(y), 'pt-BR', { numeric: true, sensitivity: 'base' });
    return c * sinal;
  });
}

function ordemDe(ctx, padrao) {
  return (app.state.ordem && app.state.ordem[ctx]) || padrao;
}

// Cabeçalho clicável: data-ordenar="<ctx>:<coluna>" (ver
// attachNotaListHandlers). A seta mostra a coluna/direção atual.
function thOrdenavel(ctx, col, label, ordem, extraClasse = '') {
  const ativa = ordem && ordem.col === col;
  const seta = ativa ? icon(ordem.dir === 'desc' ? 'setaBaixo' : 'setaCima') : '';
  return `<th class="ordenavel ${ativa ? 'ordenada' : ''} ${extraClasse}" data-ordenar="${ctx}:${col}" aria-sort="${ativa ? (ordem.dir === 'desc' ? 'descending' : 'ascending') : 'none'}">${label}${seta}</th>`;
}

// Busca simples da fila -- fornecedor, NF, centro, pagador, solicitante e
// setor (o que dá pra ler na linha).
function filtrarBuscaFila(list, busca) {
  const q = (busca || '').trim().toLowerCase();
  if (!q) return list;
  return list.filter(n => {
    const lbl = resolverLabelsNota(n);
    return [lbl.fornecedor_label, n.numero_nota, lbl.centro_custo_label, lbl.pagador_label, nomeUsuario(n.criado_por), n.setor]
      .some(v => (v || '').toLowerCase().includes(q));
  });
}

function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Resumo no lugar da antiga faixa de 7 contadores (que repetia os mesmos
// números globais em toda fila): o que interessa de cada fila é quanto
// tem nela, quanto vale e há quanto tempo a mais antiga está esperando.
function resumoFila(list, semValor = false) {
  if (list.length === 0) return '';
  const total = list.reduce((s, n) => s + (Number(n.valor_bruto) || 0), 0);
  const maisAntiga = list.reduce((m, n) => (!m || (n.criado_em && n.criado_em < m) ? n.criado_em : m), null);
  const dias = maisAntiga ? Math.max(0, Math.floor((Date.now() - new Date(maisAntiga).getTime()) / 86400000)) : null;
  const espera = dias === null ? '' : ` · mais antiga ${dias === 0 ? 'de hoje' : `há ${dias} dia${dias === 1 ? '' : 's'}`}`;
  return `${list.length} nota${list.length === 1 ? '' : 's'}${semValor ? '' : ` · ${fmtMoney(total)}`}${espera}`;
}

// Barra de cima de cada fila: busca + resumo. O resumo é da lista JÁ
// filtrada pela busca (mostra o que está na tela).
function filaToolbar(ctx, listFiltrada, semValor = false) {
  const busca = (app.state.filaBusca && app.state.filaBusca[ctx]) || '';
  return `<div class="fila-toolbar">
    <input id="f-fila-busca" data-fila-ctx="${ctx}" class="fila-busca" placeholder="Buscar fornecedor, NF, centro, solicitante..." value="${escapeHtml(busca)}">
    <span class="fila-resumo">${resumoFila(listFiltrada, semValor)}</span>
  </div>`;
}

function celulaStatusNota(n, semStatusBase = false) {
  const rascunho = n.status === 'rascunho' || n.status === 'rascunho_recebimento';
  return `<div class="badges">
    ${semStatusBase ? ''
      : rascunho ? `<span class="pend-badge muted">${statusLabel(n.status)}</span>`
      : n.status === 'recebido' ? `<span class="pend-badge muted">Recebido — aguarda complementação</span>`
      : `<span class="status-chip st-${n.status}">${statusLabel(n.status)}</span>`}
    ${n.pendente ? `<span class="pend-badge" title="${escapeHtml(n.motivo_pendencia || '')}">${icon('alerta')} Pendência</span>` : ''}
    ${n.parcelamento_id ? `<span class="pend-badge muted">Parcela ${n.parcela_numero}/${n.parcela_total}</span>` : ''}
    ${prazoBadgeCard(n).replace(/<div /g, '<span ').replace(/<\/div>/g, '</span>')}
  </div>`;
}

function renderTabelaNotas(list, opts) {
  const { id, ctx, selecao, ocultar = [], alturaMax, semStatusBase = false, ordemPadrao = { col: 'criado', dir: 'asc' } } = opts;
  if (ehMobile()) {
    return `<div class="card-list">${list.map(n => selecao ? `
      <div class="grupo-nota-row">
        <input type="checkbox" class="grupo-check" data-grupo-key="${selecao}" data-nota-id="${n.id}" ${app.state.lotesDesmarcados.has(n.id) ? '' : 'checked'}>
        <div class="grupo-nota-card-wrap">${renderCard(n)}</div>
      </div>` : renderCard(n)).join('')}</div>`;
  }
  const ordem = ordemDe(ctx, ordemPadrao);
  const linhas = ordenarNotas(list, ordem);
  const mostra = col => !ocultar.includes(col);
  const hoje = hojeIso();
  return `
  <div data-tbl-fixa="${id}" ${alturaMax ? `data-tbl-fixa-max="${alturaMax}"` : ''} class="tbl-wrap tbl-fixa tbl-notas">
  <table class="data-tbl">
    <thead><tr>
      ${selecao ? '<th class="col-check"></th>' : ''}
      ${mostra('fornecedor') ? thOrdenavel(ctx, 'fornecedor', 'Fornecedor', ordem) : thOrdenavel(ctx, 'nf', 'NF', ordem)}
      ${mostra('vencimento') ? thOrdenavel(ctx, 'vencimento', 'Vencimento', ordem) : ''}
      ${mostra('valor') ? thOrdenavel(ctx, 'valor', 'Valor', ordem, 'num-col') : ''}
      ${mostra('pagador') ? thOrdenavel(ctx, 'pagador', 'Pagador', ordem) : ''}
      ${thOrdenavel(ctx, 'centro', 'Centro de custo', ordem)}
      ${thOrdenavel(ctx, 'status', semStatusBase ? 'Situação' : 'Status', ordem)}
      ${mostra('solicitante') ? thOrdenavel(ctx, 'solicitante', 'Solicitante', ordem) : ''}
      ${thOrdenavel(ctx, 'criado', 'Lançada em', ordem)}
    </tr></thead>
    <tbody>
      ${linhas.map(n => {
        const lbl = resolverLabelsNota(n);
        const atrasada = n.vencimento && n.vencimento < hoje && !['pago', 'cancelada'].includes(n.status);
        const centro = n.tem_rateio ? `Rateado (${(n.rateios || []).length})` : (lbl.centro_custo_label || '—');
        return `<tr class="row-click nota-row" data-open="${n.id}">
        ${selecao ? `<td class="col-check"><input type="checkbox" class="grupo-check" data-grupo-key="${selecao}" data-nota-id="${n.id}" ${app.state.lotesDesmarcados.has(n.id) ? '' : 'checked'} aria-label="Selecionar nota"></td>` : ''}
        ${mostra('fornecedor')
          ? `<td class="cel-2l trunc" title="${escapeHtml(lbl.fornecedor_label)}"><div class="l1">${escapeHtml(lbl.fornecedor_label)}</div>${n.numero_nota ? `<div class="l2">NF ${escapeHtml(n.numero_nota)}</div>` : ''}</td>`
          : `<td class="cel-2l"><div class="l1">${escapeHtml(n.numero_nota || '—')}</div></td>`}
        ${mostra('vencimento') ? `<td class="${atrasada ? 'venc-atrasado' : ''}" ${atrasada ? 'title="Vencimento já passou"' : ''}>${fmtDate(n.vencimento)}</td>` : ''}
        ${mostra('valor') ? `<td class="num-col" ${n.tem_retencao_imposto ? `title="Líquido ${fmtMoney(n.valor_liquido)}"` : ''}>${fmtMoney(n.valor_bruto)}</td>` : ''}
        ${mostra('pagador') ? `<td>${escapeHtml(lbl.pagador_label || '—')}</td>` : ''}
        <td class="trunc" title="${escapeHtml(centro)}">${escapeHtml(centro)}</td>
        <td>${celulaStatusNota(n, semStatusBase)}</td>
        ${mostra('solicitante') ? `<td class="cel-2l"><div class="l1">${escapeHtml(nomeUsuario(n.criado_por))}</div><div class="l2">${escapeHtml(n.setor || '—')}</div></td>` : ''}
        <td>${fmtDate(n.criado_em)}</td>
      </tr>`;
      }).join('')}
    </tbody>
  </table>
  </div>`;
}

// Cartão de nota do celular (no desktop a fila é tabela, ver
// renderTabelaNotas): duas linhas -- fornecedor e valor; NF, vencimento e
// as etiquetas de status/pendência/prazo. A esteira completa fica só no
// detalhe (antes ela repetia em todo cartão e dobrava a altura).
export function renderCard(n) {
  const lbl = resolverLabelsNota(n);
  const atrasada = n.vencimento && n.vencimento < hojeIso() && !['pago', 'cancelada'].includes(n.status);
  return `
  <div class="nota-card" data-open="${n.id}">
    <div class="nc-l1">
      <span class="nc-fornecedor trunc">${escapeHtml(lbl.fornecedor_label)}</span>
      <span class="nc-valor" ${n.tem_retencao_imposto ? `title="Líquido ${fmtMoney(n.valor_liquido)}"` : ''}>${fmtMoney(n.valor_bruto)}</span>
    </div>
    <div class="nc-l2">
      <span class="nc-sub">NF ${escapeHtml(n.numero_nota || '—')} · <span class="${atrasada ? 'venc-atrasado' : ''}">vence ${fmtDate(n.vencimento)}</span></span>
      ${celulaStatusNota(n)}
    </div>
  </div>`;
}

export function pipeline(status) {
  const idx = STEPS.indexOf(status);
  let html = '<div class="pipe">';
  STEPS.forEach((s, i) => {
    html += `<div class="pipe-seg ${i === idx ? 'current' : ''}">
      <span class="pipe-dot ${i <= idx ? `filled st-${s}` : ''}"></span>
      <span class="pipe-label">${STATUS_LABEL[s]}</span>
    </div>`;
    if (i < STEPS.length - 1) html += `<span class="pipe-line ${i < idx ? 'done' : ''}"></span>`;
  });
  html += '</div>';
  return html;
}

// Compartilhada com o botão "Exportar Excel" (events_notas.js) — o arquivo
// exportado precisa ser exatamente a lista que está na tela, com os mesmos
// filtros aplicados. Período tem um padrão (ano corrente) de propósito —
// com anos de histórico acumulado, mostrar/exportar tudo de uma vez fica
// pesado; o usuário amplia o período se precisar de outro recorte.
export function notasFiltradasTodas() {
  let list = app.notas.filter(n => n.status !== 'rascunho' && n.status !== 'rascunho_recebimento');
  const f = app.state.filters;
  if (f.status) list = list.filter(n => n.status === f.status);
  if (f.pendente === 'sim') list = list.filter(n => n.pendente);
  if (f.pendente === 'nao') list = list.filter(n => !n.pendente);
  if (f.pagadorId) list = list.filter(n => n.pagador_id === f.pagadorId);
  if (f.setor) list = list.filter(n => n.setor === f.setor);
  if (f.centroCustoId) list = list.filter(n => n.centro_custo_id === f.centroCustoId || (n.rateios || []).some(r => r.centro_custo_id === f.centroCustoId));
  if (f.dataDe) list = list.filter(n => n[f.dataCampo] && n[f.dataCampo] >= f.dataDe);
  if (f.dataAte) list = list.filter(n => n[f.dataCampo] && n[f.dataCampo] <= f.dataAte);
  if (f.competenciaDe) list = list.filter(n => n.competencia && n.competencia.slice(0, 7) >= f.competenciaDe);
  if (f.competenciaAte) list = list.filter(n => n.competencia && n.competencia.slice(0, 7) <= f.competenciaAte);
  if (f.busca) {
    const q = f.busca.toLowerCase();
    list = list.filter(n => {
      const lbl = resolverLabelsNota(n);
      return lbl.fornecedor_label.toLowerCase().includes(q) || (n.numero_nota || '').toLowerCase().includes(q) || (lbl.centro_custo_label || '').toLowerCase().includes(q);
    });
  }
  return ordenarNotas(list, ordemDe('todas', { col: 'criado', dir: 'desc' }));
}

// Filtros de "Todas as notas" que ficam no painel "Mais filtros" -- quando
// o painel está fechado, os que estão ativos aparecem como etiquetas
// removíveis, pra nunca ter filtro escondido mexendo na lista sem a
// pessoa ver.
function etiquetasFiltrosAtivos(f) {
  const nomeDe = (lista, id) => { const x = lista.find(i => i.id === id); return x ? labelOf(x) : id; };
  const ativos = [
    f.pendente && ['pendente', f.pendente === 'sim' ? 'Só com pendência' : 'Só sem pendência'],
    f.pagadorId && ['pagadorId', `Pagador: ${nomeDe(app.cadastros.pagadores, f.pagadorId)}`],
    f.setor && ['setor', `Setor: ${f.setor}`],
    f.centroCustoId && ['centroCustoId', `Centro: ${nomeDe(app.cadastros.centros_custo, f.centroCustoId)}`],
    f.competenciaDe && ['competenciaDe', `Competência de ${fmtCompetencia(f.competenciaDe + '-01')}`],
    f.competenciaAte && ['competenciaAte', `Competência até ${fmtCompetencia(f.competenciaAte + '-01')}`],
  ].filter(Boolean);
  return ativos;
}

function renderTodas() {
  carregarFiltrosSalvos();
  const list = notasFiltradasTodas();
  const f = app.state.filters;
  const ativos = etiquetasFiltrosAtivos(f);
  const maisAberto = app.state.todasMaisFiltros || false;
  const total = list.reduce((s, n) => s + (Number(n.valor_bruto) || 0), 0);
  return `
    <div class="topbar">
      <div><h2>Todas as notas</h2><p class="sub">${list.length} nota${list.length === 1 ? '' : 's'} · ${fmtMoney(total)}</p></div>
      <button class="btn btn-ghost btn-sm" type="button" id="btn-exportar-excel" ${list.length === 0 ? 'disabled' : ''}>Exportar Excel</button>
    </div>
    <div class="filters">
      <input id="f-busca" class="filtro-busca" placeholder="Buscar fornecedor, NF ou centro de custo" value="${escapeHtml(f.busca)}">
      <select id="f-status">
        <option value="">Todos os status</option>
        ${STEPS.map(s => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}
        <option value="cancelada" ${f.status === 'cancelada' ? 'selected' : ''}>Cancelada</option>
      </select>
      <select id="f-data-campo" title="Período por">
        <option value="vencimento" ${f.dataCampo === 'vencimento' ? 'selected' : ''}>Vencimento</option>
        <option value="data_emissao" ${f.dataCampo === 'data_emissao' ? 'selected' : ''}>Emissão</option>
      </select>
      <input id="f-data-de" type="date" value="${f.dataDe}" title="De">
      <input id="f-data-ate" type="date" value="${f.dataAte}" title="Até">
      <button type="button" class="btn btn-ghost btn-sm" id="btn-mais-filtros" aria-expanded="${maisAberto}">${icon(maisAberto ? 'chevronBaixo' : 'chevronDireita')} Mais filtros${ativos.length ? ` (${ativos.length})` : ''}</button>
      <button type="button" class="btn btn-ghost btn-sm" id="btn-limpar-filtros">Limpar filtros</button>
    </div>
    <div class="filters" id="mais-filtros" ${maisAberto ? '' : 'hidden'}>
      <select id="f-pendente">
        <option value="">Pendência: todas</option>
        <option value="sim" ${f.pendente === 'sim' ? 'selected' : ''}>Só com pendência</option>
        <option value="nao" ${f.pendente === 'nao' ? 'selected' : ''}>Só sem pendência</option>
      </select>
      <select id="f-pagador">
        <option value="">Todos os pagadores</option>
        ${app.cadastros.pagadores.map(p => `<option value="${p.id}" ${f.pagadorId === p.id ? 'selected' : ''}>${escapeHtml(labelOf(p))}</option>`).join('')}
      </select>
      <select id="f-setor">
        <option value="">Todos os setores</option>
        ${SETORES.map(s => `<option value="${s}" ${f.setor === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <select id="f-centro-custo">
        <option value="">Todos os centros de custo</option>
        ${app.cadastros.centros_custo.map(c => `<option value="${c.id}" ${f.centroCustoId === c.id ? 'selected' : ''}>${escapeHtml(labelOf(c))}</option>`).join('')}
      </select>
      <label class="filtro-rotulo">Competência</label>
      <input id="f-competencia-de" type="month" value="${f.competenciaDe}" title="Competência de">
      <input id="f-competencia-ate" type="month" value="${f.competenciaAte}" title="Competência até">
    </div>
    ${!maisAberto && ativos.length ? `<div class="filtros-ativos">${ativos.map(([campo, texto]) => `<button type="button" class="filtro-chip" data-limpar-filtro="${campo}" title="Remover filtro">${escapeHtml(texto)} ${icon('fechar')}</button>`).join('')}</div>` : ''}
    ${list.length === 0 ? `<div class="empty-state">Nenhuma nota encontrada com esses filtros.</div>` : ehMobile() ? `<div class="card-list">${list.map(renderCard).join('')}</div>` : `
    <div data-tbl-fixa="todas-notas" class="tbl-wrap tbl-fixa">
    <table class="data-tbl">
      <thead><tr>
        ${[['fornecedor', 'Fornecedor'], ['nf', 'NF'], ['emissao', 'Emissão'], ['vencimento', 'Vencimento'], ['competencia', 'Competência'], ['valor', 'Valor bruto'], ['pagador', 'Pagador'], ['centro', 'Centro de custo'], ['status', 'Status'], ['setor', 'Setor'], ['solicitante', 'Solicitante']]
          .map(([col, label]) => thOrdenavel('todas', col, label, ordemDe('todas', { col: 'criado', dir: 'desc' }), col === 'valor' ? 'num-col' : '')).join('')}
      </tr></thead>
      <tbody>
        ${list.map(n => {
          const lbl = resolverLabelsNota(n);
          const expandido = app.state.rateiosExpandidos.has(n.id);
          const linhaPrincipal = `<tr class="row-click" data-open="${n.id}">
          <td class="trunc" title="${escapeHtml(lbl.fornecedor_label)}">${escapeHtml(lbl.fornecedor_label)}</td>
          <td class="mono">${escapeHtml(n.numero_nota || '—')}</td>
          <td>${fmtDate(n.data_emissao)}</td>
          <td>${fmtDate(n.vencimento)}</td>
          <td>${fmtCompetencia(n.competencia)}</td>
          <td class="num-col">${fmtMoney(n.valor_bruto)}</td>
          <td>${escapeHtml(lbl.pagador_label)}</td>
          <td>${n.tem_rateio
            ? `<a href="#" class="rateio-toggle" data-toggle-rateio="${n.id}" title="Mostrar/ocultar linhas do rateio">${icon(expandido ? 'chevronBaixo' : 'chevronDireita')} Rateado (${(n.rateios || []).length})</a>`
            : escapeHtml(lbl.centro_custo_label || '—')}</td>
          <td><span class="status-chip st-${n.status}">${statusLabel(n.status)}</span> ${n.pendente ? `<span class="pend-badge" title="Pendência: ${escapeHtml(n.motivo_pendencia || '')}">${icon('alerta')}</span>` : ''}</td>
          <td>${escapeHtml(n.setor || '—')}</td>
          <td>${escapeHtml(nomeUsuario(n.criado_por))}</td>
        </tr>`;
          const linhasRateio = (n.tem_rateio && expandido) ? (n.rateios || []).map(r => {
            const rl = resolverLabelsRateio(r);
            const partes = [rl.centro_label, rl.classe_label, rl.codigo_label].filter(Boolean).join(' · ');
            return `<tr class="rateio-subrow">
            <td colspan="5">${icon('subitem')} ${escapeHtml(partes)}${r.descricao ? ' — ' + escapeHtml(r.descricao) : ''}</td>
            <td class="mono">${fmtMoney(r.valor)}</td>
            <td colspan="5"></td>
          </tr>`;
          }).join('') : '';
          return linhaPrincipal + linhasRateio;
        }).join('')}
      </tbody>
      <tfoot><tr>
        <td colspan="5">Total (${list.length} nota${list.length === 1 ? '' : 's'})</td>
        <td class="num-col">${fmtMoney(total)}</td>
        <td colspan="5"></td>
      </tr></tfoot>
    </table>
    </div>`}
  `;
}
