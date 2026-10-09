// tests/e2e/avaliacao_ocr/pontuacao.mjs
//
// Régua do harness de avaliação do OCR: compara os campos que o leitor
// de documentos (src/js/leitor_documentos.js) extraiu com o gabarito de
// cada caso e agrega em taxas por campo. Puro (sem DOM, sem rede) -- é
// usado tanto pelos runners (avaliar.mjs, avaliar_reais.mjs) quanto pelo
// teste de regressão tests/regressao/ocr_pontuacao.mjs.
//
// Cada campo de cada caso vira um de três desfechos:
//   'acerto'  -- o leitor preencheu e bate com o gabarito
//   'erro'    -- o leitor preencheu com um valor ERRADO (erro silencioso:
//                o pior caso pra "OCR é sugestão", porque parece certo)
//   'ausente' -- o leitor não preencheu o campo
// Campo sem gabarito no caso não é pontuado (não entra no denominador).

export const CAMPOS = ['numeroNota', 'valor', 'documento', 'data', 'dataEmissao', 'vencimento', 'linhaDigitavel', 'chaveAcesso'];

export const ROTULO_CAMPO = {
  numeroNota: 'Número da nota', valor: 'Valor', documento: 'CNPJ/CPF', data: 'Data',
  dataEmissao: 'Data de emissão', vencimento: 'Vencimento',
  linhaDigitavel: 'Linha digitável', chaveAcesso: 'Chave NF-e',
};

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');
const semZerosEsquerda = (v) => soDigitos(v).replace(/^0+(?=\d)/, '');

// Data em qualquer formato que aparece aqui ('dd/mm/aaaa' do leitor,
// 'aaaa-mm-dd' do banco) -> 'aaaa-mm-dd'. Inválida -> ''.
export function normalizarData(v) {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return '';
}

// Valor normalizado de um campo, pra comparar. null = vazio.
export function normalizar(campo, v) {
  if (v === null || v === undefined || v === '') return null;
  switch (campo) {
    case 'numeroNota': { const d = semZerosEsquerda(v); return d || null; }
    case 'valor': { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }
    case 'data': case 'dataEmissao': case 'vencimento': return normalizarData(v) || null;
    default: { const d = soDigitos(v); return d || null; }
  }
}

function iguais(campo, a, b) {
  if (a === null || b === null) return false;
  if (campo === 'valor') return Math.abs(a - b) < 0.005;
  return a === b;
}

// O que o leitor devolveu (objeto `campos` de extrairCampos) no formato
// dos CAMPOS da régua -- documento junta cnpj/cpf (o gabarito sabe só "o
// documento do fornecedor", que pode ser um ou outro).
export function camposDoLeitor(campos) {
  const c = campos || {};
  return {
    numeroNota: c.numeroNota, valor: c.valor, documento: c.cnpj || c.cpf, data: c.data,
    dataEmissao: c.dataEmissao, vencimento: c.vencimento,
    linhaDigitavel: c.linhaDigitavel, chaveAcesso: c.chaveAcesso,
  };
}

// Campos que o leitor marcou como duvidosos (camposDuvidosos de
// leitor_documentos.js) no vocabulário da régua -- documento = cnpj/cpf.
export function duvidososDoLeitor(camposDuvidosos) {
  const lista = camposDuvidosos || [];
  const out = {};
  for (const c of CAMPOS) {
    out[c] = c === 'documento' ? (lista.includes('cnpj') || lista.includes('cpf')) : lista.includes(c);
  }
  return out;
}

// gabarito: { [campo]: valor | valor[] } -- uma lista aceita qualquer um
// dos valores (ex: valor bruto OU líquido; emissão OU vencimento).
export function pontuarCaso(gabarito, campos) {
  const obtidos = camposDoLeitor(campos);
  const out = {};
  for (const campo of CAMPOS) {
    const esperado = gabarito[campo];
    if (esperado === undefined || esperado === null || (Array.isArray(esperado) && !esperado.length)) continue;
    const aceitos = (Array.isArray(esperado) ? esperado : [esperado]).map(e => normalizar(campo, e)).filter(e => e !== null);
    if (!aceitos.length) continue;
    const obtido = normalizar(campo, obtidos[campo]);
    out[campo] = obtido === null ? 'ausente' : (aceitos.some(e => iguais(campo, obtido, e)) ? 'acerto' : 'erro');
  }
  return out;
}

// O valor esperado aparece em algum lugar do texto reconhecido? Separa
// "o OCR não leu" (não aparece) de "leu, mas o leitor escolheu outro
// valor" (aparece, mas o campo deu erro/ausente) -- é o que diz se o
// ganho vem de melhorar o reconhecimento (etapas 1/4) ou a escolha
// (etapa 3). Comparação só por dígitos (ignora pontuação/espaços que o
// OCR costuma trocar).
export function apareceNoTexto(campo, esperado, texto) {
  const digitosTexto = soDigitos(texto);
  const aceitos = Array.isArray(esperado) ? esperado : [esperado];
  return aceitos.some((e) => {
    if (e === null || e === undefined || e === '') return false;
    let alvo;
    if (campo === 'valor') alvo = soDigitos(Number(e).toFixed(2));
    else if (campo === 'data' || campo === 'dataEmissao' || campo === 'vencimento') { const d = normalizarData(e); alvo = d ? d.slice(8, 10) + d.slice(5, 7) + d.slice(0, 4) : ''; }
    else if (campo === 'numeroNota') alvo = semZerosEsquerda(e);
    else alvo = soDigitos(e);
    return !!alvo && digitosTexto.includes(alvo);
  });
}

// casos: [{ id, grupos: { tipo, degradacao, ... }, pontos: {campo: desfecho},
// noTexto?: {campo: bool}, duvidosos?: {campo: bool}, ms? }]. Devolve
// totais por campo, e os mesmos totais por cada valor de cada chave de
// `grupos`. "Sinalizado" = o leitor marcou o campo pra conferir: erro
// sinalizado é aceitável (a pessoa é avisada); o que importa derrubar é o
// erro NÃO sinalizado.
export function agregar(casos) {
  const novo = () => Object.fromEntries(CAMPOS.map(c => [c, { casos: 0, acerto: 0, erro: 0, ausente: 0, noTexto: 0, acertoSinalizado: 0, erroSinalizado: 0 }]));
  const somar = (alvo, caso) => {
    for (const [campo, desfecho] of Object.entries(caso.pontos)) {
      const t = alvo[campo];
      t.casos++; t[desfecho]++;
      if (caso.noTexto && caso.noTexto[campo]) t.noTexto++;
      if (caso.duvidosos && caso.duvidosos[campo] && desfecho !== 'ausente') t[desfecho + 'Sinalizado']++;
    }
  };
  const total = novo();
  const porGrupo = {};
  for (const caso of casos) {
    somar(total, caso);
    for (const [chave, valor] of Object.entries(caso.grupos || {})) {
      porGrupo[chave] ||= {};
      porGrupo[chave][valor] ||= novo();
      somar(porGrupo[chave][valor], caso);
    }
  }
  const tempos = casos.map(c => c.ms).filter(Number.isFinite);
  return {
    casos: casos.length,
    msMedio: tempos.length ? Math.round(tempos.reduce((s, t) => s + t, 0) / tempos.length) : null,
    total, porGrupo,
  };
}

export const taxa = (t, chave = 'acerto') => (t && t.casos ? t[chave] / t.casos : null);
const pct = (v) => (v === null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`);

const VAZIO = { casos: 0, acerto: 0, erro: 0, ausente: 0, noTexto: 0, acertoSinalizado: 0, erroSinalizado: 0 };
const totalDe = (agregado, campo) => (agregado.total && agregado.total[campo]) || VAZIO;
export const erroNaoSinalizado = (t) => (t && t.casos ? (t.erro - (t.erroSinalizado || 0)) / t.casos : null);
export const sinalizado = (t) => (t && t.casos ? ((t.acertoSinalizado || 0) + (t.erroSinalizado || 0)) / t.casos : null);

// Tabela markdown: uma linha por campo com acerto / erro silencioso /
// ausente / "aparece no texto" -- e, quando o leitor sinaliza campos
// duvidosos, quanto foi sinalizado e quanto erro passou SEM sinal.
// Campos sem nenhum caso ficam de fora.
export function tabelaMarkdown(agregado, titulo) {
  const linhas = [];
  if (titulo) linhas.push(`**${titulo}** (${agregado.casos} casos${agregado.msMedio ? `, ${(agregado.msMedio / 1000).toFixed(1).replace('.', ',')} s/doc` : ''})`, '');
  linhas.push('| Campo | Casos | Acerto | Erro silencioso | Ausente | Aparece no texto | Sinalizado p/ conferir | Erro NÃO sinalizado |', '|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const campo of CAMPOS) {
    const t = totalDe(agregado, campo);
    if (!t.casos) continue;
    linhas.push(`| ${ROTULO_CAMPO[campo]} | ${t.casos} | ${pct(taxa(t))} | ${pct(taxa(t, 'erro'))} | ${pct(taxa(t, 'ausente'))} | ${pct(taxa(t, 'noTexto'))} | ${pct(sinalizado(t))} | ${pct(erroNaoSinalizado(t))} |`);
  }
  return linhas.join('\n');
}

// Tabela de acerto por campo x valores de um grupo (ex: degradação).
export function tabelaPorGrupo(agregado, chave) {
  const grupos = agregado.porGrupo[chave];
  if (!grupos) return '';
  const campos = CAMPOS.filter(c => totalDe(agregado, c).casos);
  const linhas = [`| ${chave} | ${campos.map(c => ROTULO_CAMPO[c]).join(' | ')} |`, `|---|${campos.map(() => '---:').join('|')}|`];
  for (const [valor, t] of Object.entries(grupos)) {
    linhas.push(`| ${valor} | ${campos.map(c => pct(taxa(t[c]))).join(' | ')} |`);
  }
  return linhas.join('\n');
}

// Antes x depois (duas agregações), uma linha por campo.
export function tabelaComparativa(antes, depois, rotuloAntes = 'Antes', rotuloDepois = 'Depois') {
  const linhas = [`| Campo | ${rotuloAntes} | ${rotuloDepois} | Δ acerto | Erro silencioso (antes → depois) | Erro NÃO sinalizado (antes → depois) |`, '|---|---:|---:|---:|---:|---:|'];
  for (const campo of CAMPOS) {
    const a = totalDe(antes, campo), d = totalDe(depois, campo);
    if (!a.casos && !d.casos) continue;
    const ta = taxa(a), td = taxa(d);
    const delta = ta === null || td === null ? '—' : `${td - ta >= 0 ? '+' : ''}${((td - ta) * 100).toFixed(1).replace('.', ',')} pp`;
    linhas.push(`| ${ROTULO_CAMPO[campo]} | ${pct(ta)} | ${pct(td)} | ${delta} | ${pct(taxa(a, 'erro'))} → ${pct(taxa(d, 'erro'))} | ${pct(erroNaoSinalizado(a))} → ${pct(erroNaoSinalizado(d))} |`);
  }
  return linhas.join('\n');
}
