// src/js/brand.js
//
// Fonte única do ícone da marca usado inline no app (sidebar, header
// mobile, tela de login) — mesmo desenho de src/brand/icon-mark.svg
// (documento com check, ver esse arquivo pra regenerar os ícones do PWA
// a partir dele). Mantém os dois em sincronia manualmente: qualquer
// mudança de desenho precisa ser feita nos dois lugares.
export const ICON_MARK_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect width="100" height="100" rx="22" fill="#0A4038"/>
  <rect x="33" y="29" width="39" height="49" rx="7" fill="#1F6E5F"/>
  <rect x="23" y="19" width="39" height="49" rx="7" fill="#F2F1EC"/>
  <path d="M 30.5 45.5 L 40.5 55.5 L 59 32.5" fill="none" stroke="#C97A1F" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// Mesmo desenho, sem o próprio fundo — pra usar em cima de um fundo que já
// é --brand-dark (sidebar, header mobile), onde o quadrado do ícone ficaria
// duplicado/invisível por cima de um fundo igual.
export const ICON_MARK_SVG_TRANSPARENT = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="33" y="29" width="39" height="49" rx="7" fill="#1F6E5F"/>
  <rect x="23" y="19" width="39" height="49" rx="7" fill="#F2F1EC"/>
  <path d="M 30.5 45.5 L 40.5 55.5 L 59 32.5" fill="none" stroke="#C97A1F" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
