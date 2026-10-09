// src/js/captura_documento.js
//
// "Ferramenta de captura": desenhar um retângulo com o mouse sobre a
// imagem de um documento (página de PDF num <canvas>, ou <img>) e devolver
// a região em FRAÇÕES (0..1) da própria imagem -- o formato das dicas de
// posição (ver extracao_posicional.js). Usada no formulário da nota
// (janela externa, "Selecionar no documento", ver events_notas.js) e na
// aba Treinamento (ver events_treinamento.js).
//
// O wrap precisa ser inline-block em volta do <img>/<canvas>, sem
// padding/centralização: a caixa do wrap bate exatamente com a caixa do
// conteúdo, então não há letterboxing/zoom pra desfazer na conta.

// wrap: elemento em volta da imagem; retangulo: o <div> que mostra a
// seleção; aoSelecionar({ x, y, largura, altura }): chamado ao soltar o
// mouse, se a região não for minúscula (clique sem arrastar é ignorado).
export function ativarDesenhoRetangulo(wrap, retangulo, aoSelecionar) {
  if (!wrap || !retangulo) return;
  let inicio = null;

  const posicaoRelativa = (e) => {
    const rect = wrap.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };
  const aplicarEstilo = (a, b) => {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    const largura = Math.abs(b.x - a.x), altura = Math.abs(b.y - a.y);
    retangulo.style.left = (x * 100) + '%';
    retangulo.style.top = (y * 100) + '%';
    retangulo.style.width = (largura * 100) + '%';
    retangulo.style.height = (altura * 100) + '%';
    retangulo.hidden = false;
    return { x, y, largura, altura };
  };

  wrap.onmousedown = (e) => { e.preventDefault(); inicio = posicaoRelativa(e); retangulo.hidden = true; };
  wrap.onmousemove = (e) => { if (inicio) aplicarEstilo(inicio, posicaoRelativa(e)); };
  wrap.onmouseleave = () => { inicio = null; };
  wrap.onmouseup = (e) => {
    if (!inicio) return;
    const regiao = aplicarEstilo(inicio, posicaoRelativa(e));
    inicio = null;
    // Retângulo minúsculo (clique sem arrastar de verdade) -- ignora, deixa
    // a pessoa tentar de novo em vez de propor algo de uma região quase
    // vazia.
    if (regiao.largura < 0.01 || regiao.altura < 0.01) { retangulo.hidden = true; return; }
    aoSelecionar(regiao);
  };
}

// Mostra uma região já conhecida (ex: a dica gravada) sobre a imagem.
export function mostrarRetangulo(retangulo, regiao) {
  if (!retangulo || !regiao) return;
  retangulo.style.left = (regiao.x * 100) + '%';
  retangulo.style.top = (regiao.y * 100) + '%';
  retangulo.style.width = (regiao.largura * 100) + '%';
  retangulo.style.height = (regiao.altura * 100) + '%';
  retangulo.hidden = false;
}
