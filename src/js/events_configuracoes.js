// src/js/events_configuracoes.js — aba "Configurações": troca de sub-aba,
// salvar nome e trocar senha (notificações e "Atualizar dados" reaproveitam
// os handlers já existentes em events_shell.js pelos mesmos ids, então não
// precisam de wiring próprio aqui).
import { app } from './state.js';
import { render } from './app.js';
import { showToast } from './toast.js';
import { definirNovaSenha } from './auth.js';
import * as db from './db.js';

export function attachConfiguracoesHandlers() {
  document.querySelectorAll('[data-config-tab]').forEach(b => b.onclick = () => {
    app.state.configTab = b.dataset.configTab; render();
  });

  const bn = document.getElementById('btn-salvar-meu-nome');
  if (bn) bn.onclick = async () => {
    const nome = document.getElementById('meus-dados-nome').value.trim();
    if (!nome) { showToast('Informe seu nome.'); return; }
    bn.disabled = true;
    try {
      await db.atualizarMeuNome(app.usuario.id, nome);
      app.usuario.nome = nome;
      app.state.flash = 'Nome atualizado.';
    } catch (e) {
      showToast('Erro ao salvar nome: ' + e.message);
    }
    render();
  };

  const bs = document.getElementById('btn-salvar-minha-senha');
  if (bs) bs.onclick = async () => {
    const nova = document.getElementById('meus-dados-senha-nova').value;
    const confirma = document.getElementById('meus-dados-senha-confirma').value;
    if (!nova || nova.length < 6) { showToast('A nova senha precisa ter pelo menos 6 caracteres.'); return; }
    if (nova !== confirma) { showToast('As senhas não coincidem.'); return; }
    bs.disabled = true;
    const { error } = await definirNovaSenha(nova);
    if (error) { showToast('Erro ao trocar senha: ' + error); render(); return; }
    app.state.flash = 'Senha atualizada.';
    render();
  };
}
