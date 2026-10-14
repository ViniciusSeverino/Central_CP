// src/js/ui_apresentacao.js
//
// Aba "Apresentação do fluxo" (só administrador, só desktop -- ver
// navItemsFor em ui.js): a apresentação animada de como uma nota fiscal
// percorre o Central CP, pedida pro superintendente mostrar à diretoria.
// A página em si é src/apresentacao/fluxo-nf.html, aberta num iframe pra o
// CSS/JS dela não se misturar com os do app; "allow=fullscreen" deixa o
// botão "Tela cheia" de dentro dela funcionar. Os dados são fictícios e ela
// não lê nada do banco.
import { ehAdministrador } from './state.js';

const ARQUIVO = 'src/apresentacao/fluxo-nf.html';

export function renderApresentacao() {
  if (!ehAdministrador()) return '<div class="empty-state">Só o administrador tem acesso à apresentação do fluxo.</div>';
  return `
  <div class="apresentacao">
    <div class="topbar">
      <div><h2>Apresentação do fluxo</h2><p class="sub">Como uma nota fiscal vai do recebimento ao pagamento, com exemplos fictícios. Use "Tela cheia" para apresentar; as setas do teclado avançam e voltam.</p></div>
      <a class="btn btn-ghost btn-sm" href="${ARQUIVO}" target="_blank" rel="noopener">Abrir em nova aba</a>
    </div>
    <iframe class="apresentacao-quadro" src="${ARQUIVO}" title="Apresentação do fluxo de notas fiscais" allow="fullscreen" allowfullscreen></iframe>
  </div>`;
}
