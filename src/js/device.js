// src/js/device.js
//
// Decide se mostra a UI mobile (header + tabs + FAB, ver ui_mobile.js) ou
// a UI desktop de sempre (sidebar) — pelo user-agent do aparelho, não pela
// largura da janela. Só CELULAR entra na UI mobile; tablet (iPad, Android
// tablet) continua na UI desktop, que já tem espaço de sobra pra ela.
//
// "Android" sem "Mobile" no user-agent é tablet (é assim que o próprio
// Android marca a diferença — ver https://developer.chrome.com/docs/multidevice/user-agent).
const REGEX_CELULAR = /iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|IEMobile|Opera Mini/i;

export function ehMobile() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  return REGEX_CELULAR.test(ua);
}
