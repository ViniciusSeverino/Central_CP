// src/js/app.js
//
// Entrypoint: monta o DOM raiz, orquestra o ciclo render()/carregarTudo() e
// expõe os helpers compartilhados (render, closeModal*, carregarTudo) que os
// módulos de evento (events_auth/events_shell/events_cadastros/events_notas)
// chamam de volta. O detalhamento de cada tela vive nesses módulos, não aqui.
import { sessaoAtual, aoRecuperarSenha } from './auth.js';
import * as db from './db.js';
import { app, atualizarSetoresDisponiveis, podeVerDre } from './state.js';
import { renderAuth, renderShell, renderDefinirSenha } from './ui.js';
import { renderShellMobile } from './ui_mobile.js';
import { ehMobile } from './device.js';
import { attachAuthHandlers, attachDefinirSenhaHandlers, defaultViewForRole } from './events_auth.js';
import { attachShellHandlers } from './events_shell.js';
import { attachCadastroHandlers } from './events_cadastros.js';
import { attachNotaListHandlers, attachNotaModalHandlers } from './events_notas.js';
import { attachRecebimentoModalHandlers } from './events_recebimento.js';
import { attachLoteNotaListHandlers, attachLoteNotaModalHandlers } from './events_lote_notas.js';
import { attachConfiguracoesHandlers } from './events_configuracoes.js';
import { attachDashboardHandlers } from './events_dashboard.js';
import { attachOrcamentoHandlers } from './events_orcamento.js';
import { attachCaixinhaListHandlers, attachCaixinhaModalHandlers } from './events_caixinha.js';
import { attachTreinamentoHandlers } from './events_treinamento.js';
import { encerrarAbertura } from './abertura.js';
import { pushSuportado, assinaturaPushAtual } from './push.js';
import { showToast } from './toast.js';
import { salvarRolagemTabelas, ajustarTabelasFixas } from './tabelas_fixas.js';

const appEl = document.getElementById('app');

export function render() {
  if (app.state.recuperandoSenha) {
    appEl.innerHTML = renderDefinirSenha();
    attachDefinirSenhaHandlers();
    return;
  }
  const rolagemTabelas = salvarRolagemTabelas();
  appEl.innerHTML = app.usuario ? (ehMobile() ? renderShellMobile() : renderShell()) : renderAuth();
  ajustarTabelasFixas(rolagemTabelas);
  if (app.usuario) {
    attachShellHandlers();
    attachCadastroHandlers();
    attachConfiguracoesHandlers();
    attachDashboardHandlers();
    attachOrcamentoHandlers();
    attachNotaListHandlers();
    attachLoteNotaListHandlers();
    attachCaixinhaListHandlers();
    attachTreinamentoHandlers();
    if (app.state.modal) { attachNotaModalHandlers(); attachCaixinhaModalHandlers(); }
    if (app.state.modal === 'lote_nota' || app.state.modal === 'lote_linha_detalhes') attachLoteNotaModalHandlers();
    if (app.state.modal === 'novo_recebimento' || app.state.modal === 'corrigir_recebimento' || app.state.modal === 'continuar_recebimento') attachRecebimentoModalHandlers();
  } else {
    attachAuthHandlers();
  }
}
window.__render = render; // útil para debug no console

// Setores (departamentos) são cadastráveis pelo administrador (ver
// migration 0034) -- SETORES (state.js) precisa refletir a lista de
// verdade sempre que os cadastros são (re)carregados, não só no login,
// senão um departamento criado na hora não aparece nos combos de setor
// até a página recarregar inteira. Único ponto que atualiza
// app.cadastros -- os módulos de evento chamam este em vez de
// `app.cadastros = await db.carregarCadastros()` direto.
export async function recarregarCadastros() {
  app.cadastros = await db.carregarCadastros();
  atualizarSetoresDisponiveis(app.cadastros.setores.map(s => s.nome));
}

// Carrega o que o app precisa pra abrir. As consultas não dependem umas
// das outras, então vão todas juntas (antes era uma esperando a outra).
// Os dados do Group/DRE (só administrador, e de longe os maiores -- dezenas
// de milhares de receitas) NÃO seguram a abertura: vêm logo depois, em
// segundo plano (carregarDadosDre).
export async function carregarTudo() {
  const [, notas, usuarios, papeis, delegacoes, catalogo, permissoes, hints, caixinha] = await Promise.all([
    recarregarCadastros(),
    db.carregarNotas(),
    db.carregarUsuarios(),
    db.carregarPapeisEfetivos(),
    db.carregarDelegacoes(),
    db.carregarPermissoesCatalogo(),
    db.carregarUsuarioPermissoes(),
    db.carregarExtracaoHints(),
    db.carregarCaixinhaMovimentacoes(),
  ]);
  app.notas = notas;
  app.usuarios = usuarios;
  app.papeisEfetivos = papeis;
  app.delegacoes = delegacoes;
  app.permissoesCatalogo = catalogo;
  app.usuarioPermissoes = permissoes;
  app.extracaoHints = hints;
  app.caixinhaMovimentacoes = caixinha;
  app.treinamentoNotas = null; // recarrega sob demanda ao abrir a aba Treinamento
  app.avaliacoesOcr = null;
  app.state.pushSuportado = pushSuportado();
  app.state.pushInscrito = app.state.pushSuportado ? !!(await assinaturaPushAtual()) : false;
  // Depende dos papéis (podeVerDre); quem chama carregarTudo já faz o
  // render() em seguida -- os dados do DRE chegam depois e redesenham.
  carregarDadosDre();
}

// Orçamento, despesas e receitas do Group e saldos do fluxo de caixa: só
// pra quem vê o DRE (hoje, só o administrador). Roda em segundo plano;
// enquanto não chega a primeira vez, as abas Resultado/DRE/Fluxo/
// Conciliação mostram "Carregando os dados do Group..." (app.dreCarregando).
// Num "Atualizar dados", os dados antigos ficam na tela até os novos
// chegarem. Ao terminar, redesenha só se a tela que usa esses dados estiver
// aberta e sem formulário/modal em andamento (não apaga o que a pessoa
// está digitando).
export function carregarDadosDre() {
  if (!podeVerDre()) {
    app.orcamento = []; app.groupLancamentos = []; app.groupMapeamento = []; app.groupReceitas = []; app.saldosIniciais = [];
    app.dreCarregando = false;
    return Promise.resolve();
  }
  app.dreCarregando = true;
  const vazio = () => [];
  const carga = Promise.all([
    db.carregarOrcamento().catch(vazio),
    db.carregarGroupLancamentos().catch(vazio),
    db.carregarGroupMapeamento().catch(vazio),
    db.carregarGroupReceitas().catch(vazio),
    db.carregarSaldosIniciais().catch(vazio),
  ]).then(([orcamento, lancamentos, mapeamento, receitas, saldos]) => {
    app.orcamento = orcamento;
    app.groupLancamentos = lancamentos;
    app.groupMapeamento = mapeamento;
    app.groupReceitas = receitas;
    app.saldosIniciais = saldos;
    app.dreCarregadoEm = Date.now();
  }).finally(() => {
    if (app.dreCarga !== carga) return; // um "Atualizar dados" mais novo já assumiu
    app.dreCarregando = false;
    const s = app.state;
    const usaDre = s.view === 'dashboard' || (s.view === 'cadastros' && s.configTab === 'orcamento');
    const editando = !!s.modal || document.querySelector('.page-form');
    if (app.usuario && usaDre && !editando) render();
  });
  app.dreCarga = carga;
  return carga;
}

export function closeModal() { app.state.modal = null; app.state.modalData = null; render(); }

export function closeModalMaybeConfirm(protect) {
  if (protect) {
    if (confirm('Tem certeza que deseja cancelar? Os dados preenchidos neste formulário serão perdidos (a menos que você salve como rascunho).')) closeModal();
  } else closeModal();
}

export function closeModalWithFlash(msg) { app.state.modal = null; app.state.modalData = null; app.state.flash = msg; render(); }

export function restoreFocus(id) {
  const el = document.getElementById(id);
  if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
}

export function bind(id, fn) { const el = document.getElementById(id); if (el) el.onclick = fn; }

// Abre uma aba/janela nova pra um arquivo que mora num bucket privado
// (anexo de nota, comprovante de caixinha, documento de fornecedor) --
// todos precisam buscar uma URL assinada primeiro (await numa chamada de
// rede), e só ENTÃO chamar window.open(). Esse intervalo, mesmo pequeno,
// já é o suficiente pra alguns navegadores (Safari em especial, mas
// Chrome/Edge também dependendo de política) deixarem de considerar o
// clique original como o que abriu a aba -- e bloqueiam silenciosamente,
// ou nem chegam a navegar pra lugar nenhum. Bug real reportado como
// "não consigo abrir o arquivo"/"tela preta". Mitigação padrão: abre a
// aba em branco JÁ NO CLIQUE (ainda dentro da ativação do usuário) e só
// navega pra URL de verdade depois que ela chega.
export async function abrirUrlAssinadaEmNovaAba(buscarUrl) {
  const aba = window.open('', '_blank');
  if (!aba) {
    showToast('O navegador bloqueou a nova aba -- permita pop-ups para este site e tente de novo.');
    return;
  }
  try {
    aba.location.href = await buscarUrl();
  } catch (err) {
    aba.close();
    throw err;
  }
}

// PWA: só habilita "instalar como app"/tela cheia — não é estratégia de
// app offline (ver sw.js pro porquê do cache ser só do shell estático,
// nunca de dado do Supabase). 'serviceWorker' in navigator é false em
// ambiente de teste (jsdom), então isso vira um no-op seguro lá.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const registration = await navigator.serviceWorker.register('./sw.js').catch(() => null);
    if (!registration) return;

    // O navegador só checa se sw.js mudou em navegações novas (e no máximo
    // 1x/24h por padrão) -- quem deixa uma aba/PWA aberta por dias fica
    // rodando o app.js/ui.js antigos indefinidamente, mesmo já tendo saído
    // uma versão nova, e só nota algo "quebrado" (uma correção já publicada
    // que ainda não chegou nessa aba) até fechar e abrir de novo. Força uma
    // checagem toda vez que a aba volta a ficar visível, sem esperar o navegador
    // decidir sozinho quando checar.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {});
    });

    // Quando uma versão nova assume o controle (service worker novo já
    // instalado e ativo, ver skipWaiting()/clients.claim() em sw.js),
    // recarrega a página sozinha uma vez -- assim quem já estava com o app
    // aberto entra na versão nova sem precisar adivinhar que precisa
    // atualizar manualmente. Se tiver um formulário com dado não salvo
    // aberto no exato momento (mesmo data-protect="1" do aviso de "sair
    // sem salvar", ver events_shell.js), não interrompe -- só recarrega na
    // próxima vez que a aba ficar visível sem um formulário desses aberto.
    let atualizacaoPendente = false;
    const recarregarSeSeguro = () => {
      const protegido = document.getElementById('modal-bg')?.dataset.protect === '1' || document.querySelector('.page-form')?.dataset.protect === '1';
      if (protegido) { atualizacaoPendente = true; return; }
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', recarregarSeSeguro);
    document.addEventListener('visibilitychange', () => {
      if (atualizacaoPendente && document.visibilityState === 'visible') recarregarSeSeguro();
    });
  });
}

/* ============================ INIT ============================ */
aoRecuperarSenha(() => { app.state.recuperandoSenha = true; render(); });

(async function init() {
  // Enquanto carrega, a abertura animada (index.html + abertura_animacao.js)
  // cobre a tela; ela some depois do primeiro render (encerrarAbertura).
  const usuario = await sessaoAtual();
  if (usuario) {
    app.usuario = usuario;
    try {
      await carregarTudo();
      app.state.view = defaultViewForRole(usuario.role);
    } catch (e) {
      app.state.flash = 'Erro ao carregar dados: ' + e.message;
    }
  }
  render();
  encerrarAbertura();
})();
