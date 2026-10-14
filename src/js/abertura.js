// src/js/abertura.js
//
// Fim da abertura animada (ver abertura_animacao.js e o #abertura em
// index.html): chamado pelo init() do app.js DEPOIS do primeiro render() --
// o sistema já está desenhado por baixo, a logo se forma por cima e, ao
// sumir, revela o sistema. Sem a animação (testes em jsdom não rodam o
// script clássico; navegador que falhou ao carregá-lo), só tira a camada.
// Trava de segurança: se a animação não terminar (aba em segundo plano
// pausa o requestAnimationFrame), a camada sai sozinha depois de um tempo.
const LIMITE_MS = 6000;

export function encerrarAbertura() {
  const el = document.getElementById('abertura');
  if (!el) return Promise.resolve();
  const animacao = window.__aberturaCentral;
  if (!animacao) { el.remove(); return Promise.resolve(); }
  return Promise.race([
    animacao.encerrar(),
    new Promise(r => setTimeout(r, LIMITE_MS)),
  ]).then(() => { if (el.isConnected) el.remove(); });
}
