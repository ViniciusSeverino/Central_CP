// src/js/tabelas_fixas.js — tabelas com cabeçalho (e linha de total) fixos
// e rolagem só dentro da própria tabela.
//
// Opt-in: <div class="tbl-wrap tbl-fixa" data-tbl-fixa="<id único>">. O
// CSS (styles.css, ".tbl-fixa") deixa o <thead> grudado no topo e o
// <tfoot> grudado embaixo; aqui só se calcula a ALTURA da caixa de rolagem
// pra ela ocupar exatamente o que sobra da janela abaixo dela -- assim a
// página em si não rola, quem rola é a tabela.
//
// Toda ação no app redesenha a tela inteira (render() em app.js troca o
// innerHTML), o que zeraria a rolagem interna da tabela a cada clique
// (expandir um rateio, digitar na busca...). Por isso render() guarda a
// posição antes (salvarRolagemTabelas) e devolve depois
// (ajustarTabelasFixas), pelo data-tbl-fixa.
//
// No celular (shell .m-app) a altura não é limitada: a tela é pequena
// demais pra dividir entre filtros e uma caixa de rolagem própria, então
// lá a página rola normalmente, como antes.
const ALTURA_MINIMA = 280;
const RESPIRO_INFERIOR = 24; // mesmo padding-bottom do .main

export function salvarRolagemTabelas() {
  const posicoes = {};
  document.querySelectorAll('[data-tbl-fixa]').forEach(el => {
    posicoes[el.dataset.tblFixa] = { top: el.scrollTop, left: el.scrollLeft };
  });
  return posicoes;
}

export function ajustarTabelasFixas(posicoes = {}) {
  const mobile = !!document.querySelector('.m-app');
  document.querySelectorAll('[data-tbl-fixa]').forEach(el => {
    if (!mobile) {
      const topo = el.getBoundingClientRect().top + window.scrollY;
      let altura = Math.max(ALTURA_MINIMA, Math.floor(window.innerHeight - topo - RESPIRO_INFERIOR));
      el.style.maxHeight = `${altura}px`;
      // O que vem DEPOIS da tabela (legenda "N fornecedor(es)...", padding
      // do card em volta) ainda pode empurrar a página pra rolar. Mede o
      // que sobrou e tira da própria tabela -- só se ela já está cortada
      // (tem rolagem própria); uma tabela curta não encolhe à toa.
      const sobra = document.documentElement.scrollHeight - window.innerHeight;
      if (sobra > 0 && el.scrollHeight > el.clientHeight) {
        altura = Math.max(ALTURA_MINIMA, altura - sobra);
        el.style.maxHeight = `${altura}px`;
      }
    } else {
      el.style.maxHeight = '';
    }
    const pos = posicoes[el.dataset.tblFixa];
    if (pos) { el.scrollTop = pos.top; el.scrollLeft = pos.left; }
  });
}

if (typeof window !== 'undefined') {
  let agendado = null;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(agendado);
    agendado = requestAnimationFrame(() => ajustarTabelasFixas(salvarRolagemTabelas()));
  });
}
