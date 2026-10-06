// src/js/ui_configuracoes.js
//
// Central de "Configurações" -- reúne o que antes eram botões soltos na
// sidebar (Cadastros como aba própria, notificações, atualizar dados) numa
// única aba com sub-abas, mais uma nova: editar os próprios dados (nome e
// senha). "Sair" continua fora, como botão de ação direta na sidebar --
// deslogar é uma ação rápida e crítica, não uma tela pra "visitar" (ver
// events_shell.js).
import { app, escapeHtml, ROLE_LABEL, ehAdministrador, podeOperarCadastro, REGISTRY_DEFS, saibaMais } from './state.js';
import { renderCadastros, tabsVisiveis as cadastroTabsVisiveis } from './ui_cadastros.js';
import { renderArmazenamentoTab } from './ui_armazenamento.js';
import { renderArquivosTab } from './ui_arquivos.js';

// Armazenamento e Arquivos ficam no mesmo nível de Cadastros/Notificações/
// Meus dados (sub-abas de Configurações), não mais dentro da barra de
// sub-abas de Cadastros -- cada um só aparece pra quem tem permissão
// (mesma regra de antes, só mudou onde a aba mora).
const CONFIG_TABS_BASE = {
  cadastros: 'Cadastros',
  notificacoes: 'Notificações',
  meus_dados: 'Meus dados',
};

function configTabsVisiveis() {
  const tabs = { ...CONFIG_TABS_BASE };
  if (podeOperarCadastro()) tabs.arquivos = 'Arquivos';
  if (ehAdministrador()) tabs.armazenamento = 'Armazenamento';
  if (ehAdministrador()) tabs.acessos = 'Controle de acessos';
  return tabs;
}

// Itens de cadastro que, no submenu, ficam em "Administração" (pessoas e
// carga de dados) em vez de "Cadastros" (listas usadas no lançamento).
const CADASTROS_DE_ADMINISTRACAO = ['usuarios', 'delegacoes', 'importar'];

// Submenu vertical à esquerda, em 3 grupos, no lugar das duas barras de
// abas empilhadas (6 abas de Configurações + 9 de Cadastros pro
// administrador). Itens de cadastro usam data-cad-tab (handler em
// events_cadastros.js, que também volta configTab pra 'cadastros'); os
// demais, data-config-tab (events_configuracoes.js).
function renderConfigNav(active, cadActive, tabs) {
  const cad = cadastroTabsVisiveis();
  const itemCad = t => `<button type="button" data-cad-tab="${t}" class="${active === 'cadastros' && cadActive === t ? 'active' : ''}">${REGISTRY_DEFS[t].label}</button>`;
  const itemConfig = k => tabs[k] ? `<button type="button" data-config-tab="${k}" class="${active === k ? 'active' : ''}">${tabs[k]}</button>` : '';
  const listas = cad.filter(t => !CADASTROS_DE_ADMINISTRACAO.includes(t));
  const admin = [
    ...cad.filter(t => t === 'usuarios' || t === 'delegacoes').map(itemCad),
    itemConfig('acessos'), itemConfig('arquivos'), itemConfig('armazenamento'),
    ...cad.filter(t => t === 'importar').map(itemCad),
  ].filter(Boolean);
  return `<nav class="config-nav" aria-label="Configurações">
    <div class="config-nav-titulo">Cadastros</div>
    ${listas.map(itemCad).join('')}
    <div class="config-nav-titulo">Minha conta</div>
    ${itemConfig('meus_dados')}${itemConfig('notificacoes')}
    ${admin.length ? `<div class="config-nav-titulo">Administração</div>${admin.join('')}` : ''}
  </nav>`;
}

export function renderConfiguracoes() {
  const tabs = configTabsVisiveis();
  const active = app.state.configTab && tabs[app.state.configTab] ? app.state.configTab : 'cadastros';
  const cad = cadastroTabsVisiveis();
  const cadActive = app.state.cadastroTab && cad.includes(app.state.cadastroTab) ? app.state.cadastroTab : cad[0];
  const conteudo = active === 'notificacoes' ? `<h3 class="config-titulo">Notificações</h3>${renderNotificacoesTab()}`
    : active === 'meus_dados' ? `<h3 class="config-titulo">Meus dados</h3>${renderMeusDadosTab()}`
    : active === 'arquivos' ? renderArquivosTab()
    : active === 'armazenamento' ? renderArmazenamentoTab()
    : active === 'acessos' ? `<h3 class="config-titulo">Controle de acessos</h3>${renderControleDeAcessosTab()}`
    : renderCadastros({ aninhado: true });
  return `
    <div class="topbar">
      <div><h2>Configurações</h2><p class="sub">Cadastros do sistema, sua conta e administração.</p></div>
    </div>
    <div class="config-layout">
      ${renderConfigNav(active, cadActive, tabs)}
      <div class="config-conteudo">${conteudo}</div>
    </div>`;
}

// Controle de acessos (ver migration 0048): capacidades extras concedidas
// por usuário, além do papel fixo dele -- pedido do dono do produto pra
// não precisar de uma mudança de código a cada combinação de acesso nova.
// Desenho ADITIVO: desmarcar um checkbox aqui nunca tira o que o papel
// (administrador/gerente_financeiro/contas_a_pagar/departamento) já dá
// por si só, só remove a capacidade extra.
function renderControleDeAcessosTab() {
  const catalogo = app.permissoesCatalogo || [];
  const usuarios = (app.usuariosCompletos || []).filter(u => u.ativo);
  if (catalogo.length === 0 || usuarios.length === 0) {
    return `<div class="empty-state">Carregando...</div>`;
  }
  // Concessão sem noção de setor (todo o catálogo desta fase) -- grava/lê
  // sempre com setor null. As capacidades "...de qualquer setor" ganham
  // um seletor de setor próprio quando saírem de `ativa=false`.
  const concedida = (usuarioId, chave) => (app.usuarioPermissoes || []).some(
    p => p.usuario_id === usuarioId && p.permissao_chave === chave && p.setor === null
  );
  return `
    ${saibaMais('Capacidades extras por usuário, além do papel fixo dele.', 'Nunca tiram o que o papel (administrador, gerente financeiro, contas a pagar, departamento) já dá, só somam. Capacidades marcadas "Em breve" já estão mapeadas mas ainda não têm efeito.')}
    <div data-tbl-fixa="controle-acessos" class="tbl-wrap tbl-fixa">
    <table class="data-tbl">
      <thead><tr>
        <th>Usuário</th>
        ${catalogo.map(p => `<th title="${escapeHtml(p.descricao || '')}">${escapeHtml(p.rotulo)}${!p.ativa ? ' <span class="field-hint">(em breve)</span>' : ''}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${usuarios.map(u => `<tr>
          <td>${escapeHtml(u.nome)}<div class="field-hint">${escapeHtml(ROLE_LABEL[u.role] || u.role)}${u.setor ? ' · ' + escapeHtml(u.setor) : ''}</div></td>
          ${catalogo.map(p => `
          <td style="text-align:center;">
            <input type="checkbox" data-permissao-usuario="${u.id}" data-permissao-chave="${p.chave}"
              ${concedida(u.id, p.chave) ? 'checked' : ''}
              ${!p.ativa ? 'disabled title="Ainda não aplicada -- só cadastrada no catálogo"' : ''}>
          </td>`).join('')}
        </tr>`).join('')}
      </tbody>
    </table>
    </div>`;
}

function renderNotificacoesTab() {
  return `
    <div class="form-section" style="max-width:480px;">
      <h3 class="form-section-title">Notificações push</h3>
      <p class="field-hint mb-3">Receba um aviso no navegador quando uma nota sua tiver uma pendência, for aprovada, avançar de etapa ou for paga -- funciona mesmo com o Central CP fechado, sem precisar de e-mail.</p>
      ${app.state.pushSuportado
        ? `<button class="btn btn-brand" type="button" id="btn-push-toggle">${app.state.pushInscrito ? 'Notificações ativadas' : 'Ativar notificações'}</button>`
        : `<p class="field-hint">Este navegador não suporta notificações push.</p>`}
    </div>`;
}

function renderMeusDadosTab() {
  const u = app.usuario;
  return `
    <div class="form-section" style="max-width:480px;">
      <h3 class="form-section-title">Meu perfil</h3>
      <div class="field"><label>Nome</label><input id="meus-dados-nome" value="${escapeHtml(u.nome)}"></div>
      <div class="field"><label>E-mail</label><input value="${escapeHtml(u.email || '')}" disabled></div>
      <div class="field"><label>Perfil</label><input value="${escapeHtml(ROLE_LABEL[u.role])}${u.setor ? ' · ' + escapeHtml(u.setor) : ''}" disabled></div>
      <button class="btn btn-brand btn-sm" type="button" id="btn-salvar-meu-nome">Salvar nome</button>
    </div>
    <div class="form-section" style="max-width:480px;">
      <h3 class="form-section-title">Trocar senha</h3>
      <div class="field"><label>Nova senha</label><input type="password" id="meus-dados-senha-nova" autocomplete="new-password"></div>
      <div class="field"><label>Confirmar nova senha</label><input type="password" id="meus-dados-senha-confirma" autocomplete="new-password"></div>
      <button class="btn btn-brand btn-sm" type="button" id="btn-salvar-minha-senha">Salvar nova senha</button>
    </div>`;
}
