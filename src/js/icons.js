// src/js/icons.js — ícones SVG inline (traço de 2px, desenho no estilo
// Lucide) no lugar dos caracteres Unicode que o app usava como ícone
// (⚠ ▸ ▾ ✕ ⇱ ▲ ▼ 🔲 ‹ ›). Glifo de texto muda de desenho conforme a fonte
// e o sistema operacional, e o 🔲 vira emoji colorido. SVG com
// stroke="currentColor" herda a cor do texto ao redor e tem o mesmo
// desenho em todo lugar.
//
// Uso: `${icon('alerta')} Pendência`. O tamanho segue a fonte do contexto
// (1em) e o alinhamento vertical vem da classe .ic (styles.css). Ícone ao
// lado de texto é decorativo (aria-hidden); botão só com ícone precisa de
// aria-label no próprio botão.
const PATHS = {
  alerta: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  chevronDireita: '<path d="m9 18 6-6-6-6"/>',
  chevronEsquerda: '<path d="m15 18-6-6 6-6"/>',
  chevronBaixo: '<path d="m6 9 6 6 6-6"/>',
  fechar: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  abrirExterno: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  setaCima: '<path d="m18 15-6-6-6 6"/>',
  setaBaixo: '<path d="m6 9 6 6 6-6"/>',
  setaVoltar: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  selecao: '<path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M21 19a2 2 0 0 1-2 2"/><path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M14 3h1"/><path d="M9 21h1"/><path d="M14 21h1"/><path d="M3 9v1"/><path d="M3 14v1"/><path d="M21 9v1"/><path d="M21 14v1"/>',
  atualizar: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  subitem: '<path d="M4 4v7a4 4 0 0 0 4 4h12"/><path d="m15 10 5 5-5 5"/>',
};

export function icon(nome) {
  return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[nome]}</svg>`;
}
