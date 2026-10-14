// src/js/abertura_animacao.js
//
// Abertura animada do Central CP (o SVG e o CSS estão em index.html, dentro
// de #abertura). Script CLÁSSICO (não módulo), carregado logo depois do
// #abertura e antes do app.js -- assim a animação começa antes do app
// baixar/carregar os dados, e a tela não fica em branco.
//   - carregando: a ponta da flecha dá voltas num ∞ (lemniscata) com um
//     rastro luminoso, pelo tempo que o carregamento levar;
//   - window.__aberturaCentral.encerrar() (chamado por abertura.js quando o
//     app terminou de carregar): o ∞ apaga, a flecha corre pelo contorno
//     das três faces do cubo desenhando a logo (~1,2 s), as faces acendem,
//     aparece "Central CP", e 1 s depois a tela some (fade de 0,3 s). A
//     promessa resolve quando a tela sumiu.
//   - "reduzir movimento" ligado no sistema: logo parada, sem flecha.
(function () {
  var raiz = document.getElementById('abertura');
  if (!raiz) return;
  var $ = function (sel) { return raiz.querySelector(sel); };
  var trilho = $('.abertura-trilho');
  var rastros = Array.prototype.slice.call(raiz.querySelectorAll('.abertura-rastro'));
  var faces = Array.prototype.slice.call(raiz.querySelectorAll('.abertura-face'));
  var flecha = $('.abertura-flecha');
  var infinito = $('.abertura-infinito');
  var nome = $('.abertura-nome');
  var estado = $('.abertura-estado');
  var reduzido = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var VOLTA_MS = 2200, DESENHO_MS = 1200, ACENDER_MS = 450, ESPERA_MS = 1000, SAIDA_MS = 300;

  // Lemniscata de Bernoulli centrada no cubo.
  var CX = 627, CY = 612, A = 330, d = '';
  for (var i = 0; i <= 240; i++) {
    var t = (i / 240) * Math.PI * 2, s = Math.sin(t), c = Math.cos(t), q = 1 + s * s;
    d += (i ? ' L' : 'M') + (CX + (A * c) / q).toFixed(1) + ' ' + (CY + (A * s * c) / q).toFixed(1);
  }
  trilho.setAttribute('d', d);
  rastros.forEach(function (r) { r.setAttribute('d', d); });

  var L = trilho.getTotalLength ? trilho.getTotalLength() : 0;
  var comprimentos = faces.map(function (f) { return f.getTotalLength ? f.getTotalLength() : 0; });
  var totalLogo = comprimentos.reduce(function (a, b) { return a + b; }, 0);

  function acesa() {
    faces.forEach(function (f) {
      f.setAttribute('fill', f.dataset.fill);
      f.style.transition = 'fill-opacity .45s ease, stroke-opacity .45s ease';
      f.style.fillOpacity = 1;
      f.style.strokeOpacity = 0.25;
      f.style.strokeDashoffset = 0;
    });
  }

  function sair(resolver) {
    raiz.classList.add('saindo');
    setTimeout(function () { raiz.remove(); resolver(); }, SAIDA_MS);
  }

  // Sem animação (movimento reduzido ou navegador sem SVG medível): logo
  // parada desde o início.
  if (reduzido || !L || !totalLogo) {
    infinito.style.display = 'none';
    faces.forEach(function (f) { f.setAttribute('stroke', '#dfe6ff'); f.setAttribute('stroke-width', '4'); });
    acesa();
    window.__aberturaCentral = {
      encerrar: function () {
        return new Promise(function (resolver) {
          estado.hidden = true;
          nome.classList.add('visivel');
          setTimeout(function () { sair(resolver); }, ESPERA_MS);
        });
      },
    };
    return;
  }

  faces.forEach(function (f, i) {
    f.setAttribute('stroke', '#dfe6ff');
    f.setAttribute('stroke-width', '4');
    f.setAttribute('stroke-linejoin', 'round');
    f.style.strokeDasharray = comprimentos[i];
    f.style.strokeDashoffset = comprimentos[i];
    f.style.fillOpacity = 0;
  });
  flecha.setAttribute('opacity', '1');

  function pontoEAngulo(path, pos, total) {
    var p = path.getPointAtLength(((pos % total) + total) % total);
    var q2 = path.getPointAtLength((((pos + 2) % total) + total) % total);
    return { x: p.x, y: p.y, ang: Math.atan2(q2.y - p.y, q2.x - p.x) * 180 / Math.PI };
  }
  function porFlecha(p) { flecha.setAttribute('transform', 'translate(' + p.x + ' ' + p.y + ') rotate(' + p.ang + ')'); }
  var suave = function (x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };

  var inicio = performance.now(), pedidoFim = null, fimResolver = null;

  function quadroCarregando(agora) {
    var pos = ((agora - inicio) / VOLTA_MS) * L;
    porFlecha(pontoEAngulo(trilho, pos, L));
    rastros.forEach(function (r) {
      var tam = L * Number(r.dataset.frac);
      r.style.strokeDasharray = tam + ' ' + L;
      r.style.strokeDashoffset = -(pos - tam);
      r.style.opacity = r.dataset.op;
    });
    if (pedidoFim) { comecarLogo(agora); return; }
    requestAnimationFrame(quadroCarregando);
  }

  function comecarLogo(agora) {
    inicio = agora;
    estado.hidden = true;
    infinito.style.transition = 'opacity .5s ease';
    infinito.style.opacity = 0;
    requestAnimationFrame(quadroLogo);
  }

  function quadroLogo(agora) {
    var t = Math.min(1, (agora - inicio) / DESENHO_MS);
    var resta = suave(t) * totalLogo;
    faces.forEach(function (f, i) {
      var feito = Math.max(0, Math.min(comprimentos[i], resta));
      f.style.strokeDashoffset = comprimentos[i] - feito;
      if (resta > 0 && resta <= comprimentos[i]) porFlecha(pontoEAngulo(f, feito, comprimentos[i]));
      resta -= comprimentos[i];
    });
    if (t < 1) { requestAnimationFrame(quadroLogo); return; }
    flecha.style.transition = 'opacity .25s ease';
    flecha.style.opacity = 0;
    acesa();
    nome.classList.add('visivel');
    setTimeout(function () { sair(fimResolver); }, ACENDER_MS + ESPERA_MS);
  }

  requestAnimationFrame(quadroCarregando);

  window.__aberturaCentral = {
    encerrar: function () {
      if (!pedidoFim) pedidoFim = new Promise(function (resolver) { fimResolver = resolver; });
      return pedidoFim;
    },
  };
})();
