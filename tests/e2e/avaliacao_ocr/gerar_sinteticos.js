// tests/e2e/avaliacao_ocr/gerar_sinteticos.js
//
// Roda DENTRO do navegador (injetado pelo avaliar.mjs via addScriptTag):
// desenha o layout de um caso sintético (casos_sinteticos.mjs) num canvas
// e aplica a degradação do caso -- ruído, baixo contraste, inclinação,
// rotação, baixa resolução, desfoque ou "foto de celular" (combinação).
// Devolve um PNG (Blob), que é exatamente o que o app recebe quando a
// pessoa anexa uma foto/scan.
(function () {
  function prng(semente) {
    let a = semente >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Código de barras "de enfeite" (I2of5 simplificado): só pra página ter
  // o bloco de barras que todo boleto tem -- o OCR precisa conviver com
  // ele, não decodificá-lo.
  function desenharBarras(ctx, x, y, codigo) {
    let cx = x;
    ctx.fillStyle = '#000';
    for (const d of codigo) {
      const n = Number(d);
      for (let k = 0; k < 4; k++) {
        const larg = ((n >> k) & 1) ? 4 : 2;
        if (k % 2 === 0) ctx.fillRect(cx, y, larg, 70);
        cx += larg + 1;
      }
    }
  }

  function desenharPagina(pagina, efeitos) {
    const c = document.createElement('canvas');
    c.width = pagina.largura; c.height = pagina.altura;
    const ctx = c.getContext('2d');
    const fundo = efeitos.fundo ?? 255;
    const tinta = efeitos.tinta ?? 0;
    ctx.fillStyle = `rgb(${fundo},${fundo},${fundo})`;
    ctx.fillRect(0, 0, c.width, c.height);
    if (efeitos.gradiente) {
      // sombra/iluminação desigual típica de foto: escurece um canto
      const g = ctx.createLinearGradient(0, 0, c.width, c.height);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.28)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.fillStyle = `rgb(${tinta},${tinta},${tinta})`;
    ctx.strokeStyle = `rgb(${tinta},${tinta},${tinta})`;
    ctx.textBaseline = 'alphabetic';
    for (const l of pagina.linhas) {
      if (l.barras) { desenharBarras(ctx, l.x, l.y, l.barras); ctx.fillStyle = `rgb(${tinta},${tinta},${tinta})`; continue; }
      ctx.font = `${l.b ? 'bold ' : ''}${l.s}px "DejaVu Sans", Arial, sans-serif`;
      ctx.fillText(l.t, l.x, l.y);
    }
    // molduras de campos, como nos formulários reais
    ctx.lineWidth = 1;
    ctx.strokeRect(40, 30, c.width - 80, c.height - 300);
    return c;
  }

  function transformar(origem, { angulo = 0, rotacao = 0, escala = 1, desfoque = 0, fundo = 255 }) {
    const rad = ((rotacao + angulo) * Math.PI) / 180;
    const w = origem.width * escala, h = origem.height * escala;
    const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
    const c = document.createElement('canvas');
    c.width = Math.round(w * cos + h * sin);
    c.height = Math.round(w * sin + h * cos);
    const ctx = c.getContext('2d');
    ctx.fillStyle = `rgb(${fundo},${fundo},${fundo})`;
    ctx.fillRect(0, 0, c.width, c.height);
    if (desfoque) ctx.filter = `blur(${desfoque}px)`;
    ctx.imageSmoothingEnabled = true;
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(origem, -w / 2, -h / 2, w, h);
    return c;
  }

  function ruido(c, { ruido = 0, salPimenta = 0, semente = 1 }) {
    if (!ruido && !salPimenta) return c;
    const r = prng(semente * 31 + 7);
    const ctx = c.getContext('2d');
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      let delta = 0;
      if (ruido) {
        // gaussiano aproximado (soma de 3 uniformes)
        delta = (r() + r() + r() - 1.5) * ruido * 1.4;
      }
      for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, d[i + k] + delta));
      if (salPimenta && r() < salPimenta) {
        const v = r() < 0.5 ? 0 : 255;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  window.__gerarImagemSintetica = async function (caso) {
    const e = caso.efeitos || {};
    let c = desenharPagina(caso.pagina, e);
    if (e.angulo || e.rotacao || (e.escala && e.escala !== 1) || e.desfoque) c = transformar(c, e);
    c = ruido(c, e);
    return await new Promise((resolve) => c.toBlob(resolve, 'image/png'));
  };
})();
