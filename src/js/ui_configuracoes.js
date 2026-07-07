// src/js/ui_configuracoes.js
//
// Central de "Configurações" -- reúne o que antes eram botões soltos na
// sidebar (Cadastros como aba própria, notificações, atualizar dados) numa
// única aba com sub-abas, mais uma nova: editar os próprios dados (nome e
// senha). "Sair" continua fora, como botão de ação direta na sidebar --
// deslogar é uma ação rápida e crítica, não uma tela pra "visitar" (ver
// events_shell.js).
import { app, escapeHtml, ROLE_LABEL, ehAdministrador, podeOperarCadastro } from './state.js';
import { renderCadastros } from './ui_cadastros.js';
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
  return tabs;
}

export function renderConfiguracoes() {
  const tabs = configTabsVisiveis();
  const active = app.state.configTab && tabs[app.state.configTab] ? app.state.configTab : 'cadastros';
  const topbar = `
    <div class="topbar">
      <div><h2>Configurações</h2><p class="sub">Cadastros do sistema, notificações e os seus dados de acesso.</p></div>
      <button class="btn btn-ghost btn-sm" type="button" id="btn-refresh">Atualizar dados</button>
    </div>
    <div class="tabset" style="max-width:fit-content; padding:3px; margin-bottom:18px; flex-wrap:wrap;">
      ${Object.entries(tabs).map(([key, label]) => `<button data-config-tab="${key}" class="${active === key ? 'active' : ''}" style="padding:8px 14px; flex:none;">${label}</button>`).join('')}
    </div>`;

  if (active === 'notificacoes') return `${topbar}${renderNotificacoesTab()}`;
  if (active === 'meus_dados') return `${topbar}${renderMeusDadosTab()}`;
  if (active === 'arquivos') return `${topbar}${renderArquivosTab()}`;
  if (active === 'armazenamento') return `${topbar}${renderArmazenamentoTab()}`;
  return `${topbar}${renderCadastros({ aninhado: true })}`;
}

function renderNotificacoesTab() {
  return `
    <div class="form-section" style="max-width:480px;">
      <h3 class="form-section-title">Notificações push</h3>
      <p class="field-hint" style="margin-bottom:14px;">Receba um aviso no navegador quando uma nota sua tiver uma pendência, for aprovada, avançar de etapa ou for paga -- funciona mesmo com o Central CP fechado, sem precisar de e-mail.</p>
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
