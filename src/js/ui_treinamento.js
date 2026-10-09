// src/js/ui_treinamento.js
//
// Aba Treinamento do OCR (só administrador -- ver treinamento_ocr.js pro
// porquê e events_treinamento.js pros eventos). Duas telas:
//   - lista: notas pagas (passaram pela esteira inteira) com o anexo ainda
//     no Storage, agrupadas por fornecedor, e o painel de acerto geral;
//   - nota: o documento (página a página, com o tipo de cada página) à
//     esquerda e um cartão por campo à direita -- valor lançado, o que o
//     leitor acha hoje e o botão pra indicar no documento.
// O documento e a leitura chegam depois (async, ver events_treinamento.js)
// -- por isso os pedaços que mudam têm um container próprio e uma função
// de render separada, que os eventos chamam sem re-renderizar a tela toda.
import { app, escapeHtml, fmtMoney, fmtDate, ehAdministrador } from './state.js';
import { icon } from './icons.js';
import { gruposParaTreino, camposDoTreino, situacaoDoCampo, dicasPorCampo, TIPOS_PAGINA, ROTULO_CAMPO_TREINO, camposDivergentes, avaliacaoVencida, resumoDaAvaliacao } from './treinamento_ocr.js';
import { taxa, erroNaoSinalizado, sinalizado, totalDe, ROTULO_CAMPO } from './ocr_acerto.js';

const fornecedorPorId = (id) => (app.cadastros.fornecedores || []).find(f => f.id === id) || null;
const treinadasSet = () => new Set((app.treinamentoNotas || []).map(t => t.nota_id));
const pct = (v) => (v === null ? '—' : `${Math.round(v * 100)}%`);

function formatarLancado(campo, v) {
  if (v === null || v === undefined || (Array.isArray(v) && !v.length)) return '<span class="muted">—</span>';
  if (campo === 'valor') return (Array.isArray(v) ? v : [v]).map(x => fmtMoney(x)).join(' ou ');
  if (campo === 'dataEmissao' || campo === 'vencimento') return fmtDate(v);
  return escapeHtml(String(v));
}
const formatarLido = (campo, v) => (v === null || v === undefined || v === ''
  ? '<span class="muted">não achou</span>'
  : campo === 'valor' ? fmtMoney(v) : escapeHtml(String(v)));

export function renderTreinamento() {
  if (!ehAdministrador()) return '<div class="empty-state">Só o administrador tem acesso ao treinamento do leitor.</div>';
  if (!app.treinamentoNotas || !app.avaliacoesOcr) return '<div class="empty-state">Carregando o treinamento do leitor...</div>';
  const t = app.state.treinamento;
  const nota = t.notaId && app.notas.find(n => n.id === t.notaId);
  return nota ? renderNotaTreino(nota) : renderListaTreino();
}

function renderListaTreino() {
  const t = app.state.treinamento;
  return `
  <div>
    <div class="topbar">
      <div><h2>Treinamento do leitor</h2><p class="sub">Notas pagas em que o leitor ainda diverge do que foi lançado. Abra uma, indique no documento onde está cada campo, e o leitor passa a acertar as próximas notas desse fornecedor — as outras notas dele são reavaliadas sozinhas.</p></div>
    </div>
    <div class="treino-painel card">
      <div class="treino-painel-topo">
        <div><b>Acerto do leitor</b><p class="sub m-0">Relê as 30 notas pagas mais recentes (com as dicas de cada fornecedor) e compara com o que foi lançado. Roda aqui no seu navegador.</p></div>
        <button type="button" class="btn btn-ghost btn-sm" id="btn-treino-medir-geral">Medir acerto</button>
      </div>
      <div id="treino-painel-geral"></div>
    </div>
    <div id="treino-resumo">${renderResumoTreino(null)}</div>
    <div class="treino-filtros">
      <input id="treino-busca" type="search" placeholder="Buscar fornecedor ou nº da nota" value="${escapeHtml(t.busca)}">
      <label class="treino-check"><input type="checkbox" id="treino-mostrar-acertos" ${t.mostrarAcertos ? 'checked' : ''}> Mostrar também as que o leitor já acerta</label>
      <label class="treino-check"><input type="checkbox" id="treino-so-pendentes" ${t.soPendentes ? 'checked' : ''}> Só as ainda não treinadas</label>
    </div>
    <div id="treino-lista">${renderGruposTreino()}</div>
  </div>`;
}

// Resumo da avaliação + andamento da fila de (re)avaliação (fila: o estado
// da fila em events_treinamento.js; null no primeiro desenho).
export function renderResumoTreino(fila) {
  const r = resumoDaAvaliacao(app.notas, app.avaliacoesOcr, app.extracaoHints);
  const rodando = fila && fila.rodando && !fila.parada;
  const total = r.aAvaliar + (fila ? fila.feitas : 0);
  const andamento = !r.aAvaliar
    ? ''
    : rodando
      ? `<div class="treino-progresso"><div style="width:${total ? Math.round(((fila.feitas) / total) * 100) : 0}%"></div></div>
         <p class="sub m-0">Lendo os anexos pra comparar com o lançado — faltam ${r.aAvaliar}. Roda aqui no seu navegador e continua de onde parou na próxima vez. <button type="button" class="btn btn-ghost btn-sm" id="btn-treino-parar-fila">Parar</button></p>`
      : `<p class="sub m-0">${r.aAvaliar} nota(s) ainda sem avaliação. <button type="button" class="btn btn-ghost btn-sm" id="btn-treino-retomar-fila">Avaliar agora</button></p>`;
  return `
  <div class="treino-resumo card">
    <div class="treino-resumo-numeros">
      <span><b>${r.divergentes}</b> com divergência</span>
      <span><b>${r.acertam}</b> o leitor já acerta</span>
      <span><b>${r.aAvaliar}</b> a avaliar</span>
    </div>
    ${andamento}
  </div>`;
}

const ROTULO_CURTO = { numeroNota: 'Nº', valor: 'Valor', cnpj: 'CNPJ', cpf: 'CPF', dataEmissao: 'Emissão' };

function situacaoDaAvaliacao(n) {
  const a = app.avaliacoesOcr.get(n.id);
  if (!a) return '<span class="muted">a avaliar</span>';
  const hints = (app.extracaoHints || []).filter(h => h.fornecedor_id === n.fornecedor_id);
  const vencida = avaliacaoVencida(a, hints) ? ' <span class="muted">(reavaliando...)</span>' : '';
  const div = camposDivergentes(a);
  if (!div.length) return `<span class="status-chip tone-good">Acerta tudo</span>${vencida}`;
  return `${div.map(c => `<span class="status-chip tone-amber" title="${escapeHtml(lidoNaAvaliacao(c, a.campos[c].lido))}">${ROTULO_CURTO[c] || c}</span>`).join(' ')}${vencida}`;
}
const lidoNaAvaliacao = (campo, lido) => (lido === null || lido === undefined ? 'O leitor não achou' : `O leitor achou: ${campo === 'valor' ? fmtMoney(lido) : lido}`);

export function renderGruposTreino() {
  const t = app.state.treinamento;
  const grupos = gruposParaTreino(app.notas, { fornecedores: app.cadastros.fornecedores || [], treinadas: treinadasSet(), busca: t.busca, soPendentes: t.soPendentes, avaliacoes: app.avaliacoesOcr, mostrarAcertos: t.mostrarAcertos });
  if (!grupos.length) {
    const r = resumoDaAvaliacao(app.notas, app.avaliacoesOcr, app.extracaoHints);
    const msg = t.busca || t.mostrarAcertos ? 'Nenhuma nota para treinar com esse filtro.'
      : r.aAvaliar ? 'Nenhuma divergência encontrada até agora — a avaliação continua acima.'
        : 'O leitor já acerta todas as notas avaliadas. Nada para treinar agora.';
    return `<div class="empty-state">${msg}</div>`;
  }
  const treinadas = treinadasSet();
  return grupos.map(g => {
    const dicas = dicasPorCampo(app.extracaoHints, g.fornecedorId);
    const comPosicao = Object.values(dicas).filter(h => h.pos_x != null).map(h => ROTULO_CAMPO_TREINO[h.campo] || h.campo);
    return `
    <div class="treino-grupo card">
      <div class="treino-grupo-topo">
        <div><b>${escapeHtml(g.nome)}</b> <span class="muted">· ${g.divergentes} com divergência de ${g.total} nota(s) paga(s) · ${g.treinadas} treinada(s)</span></div>
        <div class="muted treino-dicas">${comPosicao.length ? `Dicas: ${escapeHtml(comPosicao.join(', '))}` : 'Sem dicas de posição ainda'}</div>
      </div>
      <table class="data-tbl">
        <thead><tr><th>Nº</th><th>Emissão</th><th class="num-col">Valor</th><th>O leitor diverge em</th><th>Treino</th><th></th></tr></thead>
        <tbody>
          ${g.notas.map(n => `<tr>
            <td>${escapeHtml(n.numero_nota || '—')}</td>
            <td>${n.data_emissao ? fmtDate(n.data_emissao) : '—'}</td>
            <td class="num-col">${fmtMoney(n.valor_bruto)}</td>
            <td>${situacaoDaAvaliacao(n)}</td>
            <td>${treinadas.has(n.id) ? '<span class="status-chip tone-good">Treinada</span>' : '<span class="status-chip">Pendente</span>'}</td>
            <td><button type="button" class="btn btn-ghost btn-sm" data-treino-abrir="${n.id}">Treinar</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }).join('');
}

function renderNotaTreino(n) {
  const f = fornecedorPorId(n.fornecedor_id);
  const treinada = treinadasSet().has(n.id);
  return `
  <div>
    <div class="topbar">
      <div>
        <button type="button" class="btn btn-ghost btn-sm" id="btn-treino-voltar">${icon('chevronEsquerda')} Voltar à lista</button>
        <h2>${escapeHtml(f ? f.nome : 'Sem fornecedor')} · nº ${escapeHtml(n.numero_nota || '—')}</h2>
        <p class="sub">Clique em "Indicar no documento" num campo e desenhe um retângulo em volta do valor certo. Marque também o tipo de cada página (o PDF junta nota, boleto e comprovante, e a ordem muda de nota pra nota).${treinada ? ' <span class="status-chip tone-good">Treinada</span>' : ''}</p>
      </div>
    </div>
    <div class="treino-grid">
      <div class="treino-doc card" id="treino-doc">
        <div class="preview-indisponivel">Carregando o documento...</div>
      </div>
      <div class="treino-lado">
        <div id="treino-campos"><div class="preview-indisponivel">Lendo o documento...</div></div>
        <div class="treino-acoes">
          <button type="button" class="btn btn-brand btn-sm" id="btn-treino-concluir">Concluir esta nota</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btn-treino-conferir-fornecedor">Conferir este fornecedor</button>
        </div>
        <div id="treino-painel-fornecedor"></div>
      </div>
    </div>
  </div>`;
}

// Cabeçalho do documento: navegação de página + tipo da página atual.
// ctx: { pagina, totalPaginas, tiposPagina, ativo (campo sendo indicado) }.
export function renderCabecalhoDocumento(ctx) {
  const tipo = ctx.tiposPagina[ctx.pagina] || 'nao_identificado';
  return `
  <div class="treino-doc-topo">
    <div class="treino-paginas">
      <button type="button" class="btn btn-ghost btn-sm" data-treino-pagina="${ctx.pagina - 1}" ${ctx.pagina <= 1 ? 'disabled' : ''}>${icon('chevronEsquerda')}</button>
      <span>Página ${ctx.pagina} de ${ctx.totalPaginas}</span>
      <button type="button" class="btn btn-ghost btn-sm" data-treino-pagina="${ctx.pagina + 1}" ${ctx.pagina >= ctx.totalPaginas ? 'disabled' : ''}>${icon('chevronDireita')}</button>
    </div>
    <label class="treino-tipo">Tipo desta página
      <select id="treino-tipo-pagina">${TIPOS_PAGINA.map(([v, r]) => `<option value="${v}" ${v === tipo ? 'selected' : ''}>${r}</option>`).join('')}</select>
    </label>
  </div>
  ${ctx.ativo ? `<div class="selecao-instrucao"><p>Desenhe um retângulo em volta de <b>${escapeHtml(ROTULO_CAMPO_TREINO[ctx.ativo] || ctx.ativo)}</b> (pode trocar de página antes).</p><button type="button" class="btn btn-ghost btn-sm" data-treino-cancelar>Cancelar</button></div>` : ''}`;
}

// Um cartão por campo. ctx: { leitura (de analisarAnexo, com as dicas),
// captura ({ campo, valor, pagina } -- o que caiu no retângulo desenhado,
// ainda não salvo), ativo, salvando }.
export function renderCartoesCampos(n, ctx) {
  const f = fornecedorPorId(n.fornecedor_id);
  const dicas = dicasPorCampo(app.extracaoHints, n.fornecedor_id);
  const campos = (ctx.leitura && ctx.leitura.campos) || {};
  return camposDoTreino(n, f).map(c => {
    const lido = campos[c.campo];
    const sit = situacaoDoCampo(c.campo, c.lancado, lido);
    const dica = dicas[c.campo];
    const cap = ctx.captura && ctx.captura.campo === c.campo ? ctx.captura : null;
    const capConfere = cap ? (c.lancado ? situacaoDoCampo(c.campo, c.lancado, cap.valor) : cap.valor !== null) : null;
    return `
    <div class="treino-campo card ${ctx.ativo === c.campo ? 'ativo' : ''}" data-treino-campo="${c.campo}">
      <div class="treino-campo-topo"><b>${escapeHtml(c.rotulo)}</b>
        ${sit === true ? '<span class="status-chip tone-good">Leitor acerta</span>' : sit === false ? '<span class="status-chip tone-amber">Leitor erra</span>' : ''}</div>
      <div class="treino-campo-linha"><span class="muted">Lançado</span> ${formatarLancado(c.campo, c.lancado)}</div>
      <div class="treino-campo-linha"><span class="muted">Leitor</span> ${ctx.leitura ? formatarLido(c.campo, lido) : '<span class="muted">lendo...</span>'}</div>
      ${dica && dica.pos_x != null ? `<div class="treino-campo-linha muted">Dica salva: página ${dica.pagina || 1}${dica.tipo_pagina ? ` (${escapeHtml((TIPOS_PAGINA.find(t => t[0] === dica.tipo_pagina) || [, dica.tipo_pagina])[1])})` : ''}</div>` : ''}
      ${cap ? `
        <div class="treino-captura ${capConfere === false ? 'diverge' : ''}">
          ${cap.valor === null
            ? 'Não reconheci um valor válido nessa região — desenhe de novo, um pouco mais justo.'
            : `Na região: <b>${formatarLido(c.campo, cap.valor)}</b> ${capConfere === true ? '— confere com o lançado.' : capConfere === false ? '— diferente do lançado. Salve só se o lançado estiver errado ou o documento tiver outro formato.' : ''}`}
          <div class="treino-captura-acoes">
            ${cap.valor !== null ? `<button type="button" class="btn ${capConfere === false ? 'btn-alert' : 'btn-brand'} btn-sm" data-treino-salvar="${c.campo}" ${ctx.salvando ? 'disabled' : ''}>${capConfere === false ? 'Salvar mesmo assim' : 'Salvar indicação'}</button>` : ''}
            <button type="button" class="btn btn-ghost btn-sm" data-treino-indicar="${c.campo}">Desenhar de novo</button>
          </div>
        </div>` : `<button type="button" class="btn btn-ghost btn-sm" data-treino-indicar="${c.campo}">${dica && dica.pos_x != null ? 'Indicar de novo' : 'Indicar no documento'}</button>`}
    </div>`;
  }).join('');
}

// Progresso / resultado de uma medição de acerto (painel geral ou do
// fornecedor). estado: { feitas, total, agregado, cancelado, erro }.
export function renderPainelAcerto(estado) {
  if (!estado) return '';
  if (estado.erro) return `<p class="sub">Não deu pra medir: ${escapeHtml(estado.erro)}</p>`;
  const andamento = estado.feitas < estado.total && !estado.cancelado
    ? `<div class="treino-progresso"><div style="width:${Math.round((estado.feitas / estado.total) * 100)}%"></div></div>
       <p class="sub">Lendo ${estado.feitas + 1} de ${estado.total}... <button type="button" class="btn btn-ghost btn-sm" data-treino-cancelar-medicao>Parar</button></p>`
    : `<p class="sub">${estado.cancelado ? 'Parado em' : 'Lidas'} ${estado.feitas} de ${estado.total} nota(s).</p>`;
  const ag = estado.agregado;
  if (!ag || !ag.casos) return andamento;
  const linhas = ['numeroNota', 'valor', 'documento', 'dataEmissao'].map(c => {
    const t = totalDe(ag, c);
    if (!t.casos) return '';
    return `<tr><td>${ROTULO_CAMPO[c]}</td><td class="num-col">${t.acerto} de ${t.casos}</td><td class="num-col">${pct(taxa(t))}</td><td class="num-col">${pct(erroNaoSinalizado(t))}</td><td class="num-col">${pct(sinalizado(t))}</td></tr>`;
  }).join('');
  return `${andamento}
    <table class="data-tbl treino-acerto">
      <thead><tr><th>Campo</th><th class="num-col">Acertos</th><th class="num-col">Acerto</th><th class="num-col">Erro sem aviso</th><th class="num-col">Marcado "confira"</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>`;
}
