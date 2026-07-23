// src/js/aprendizado_extracao.js
//
// "Ensinar o leitor": quando o leitor de documentos (leitor_documentos.js)
// não acha um campo (número da nota, valor) ou não identifica o tipo do
// documento, o painel de auditoria pergunta pra pessoa -- a resposta vira
// uma "dica" (âncora de texto + campo), associada ao FORNECEDOR da nota,
// guardada em fornecedor_extracao_hints. Documentos do mesmo fornecedor
// tendem a ter o mesmo layout (o mesmo sistema de faturamento gerou
// todos), então a âncora aprendida numa nota serve pras próximas do mesmo
// fornecedor -- sem isso não tem como saber ONDE no texto está o valor
// certo, já que a extração de leitor_documentos.js é regex genérica (não
// entende o layout específico de cada fornecedor).
//
// Tudo aqui é puro (sem I/O) -- quem lê/grava fornecedor_extracao_hints
// no Supabase é db.js; quem decide QUANDO chamar é a UI (ui_nota.js /
// events_notas.js).

const JANELA_ANCORA = 60; // chars após a âncora onde o valor deve aparecer

// Mesmos formatos de leitor_documentos.js -- mas aplicados numa JANELA
// pequena logo após a âncora aprendida, não no texto inteiro (é isso que
// torna a busca específica do fornecedor, evitando pegar o primeiro
// número/valor genérico do documento).
export const REGEX_POR_CAMPO = {
  numeroNota: /(\d[\d.\-\/]{2,})/,
  valor: /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/,
  cnpj: /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/,
  cpf: /(\d{3}\.\d{3}\.\d{3}-\d{2})/,
  data: /(\d{2}\/\d{2}\/\d{4})/,
};

function paraNumeroBr(strBr) {
  const limpo = strBr.includes(',') ? strBr.replace(/\./g, '').replace(',', '.') : strBr;
  const n = parseFloat(limpo);
  return Number.isNaN(n) ? null : n;
}

// hints: array de { campo, ancora, valor_exemplo } já filtrado pro
// fornecedor da nota atual. Devolve só os campos que alguma âncora
// conseguiu resolver de verdade (âncora não encontrada no texto, ou
// encontrada mas sem um valor no formato esperado logo depois, não entra
// no resultado -- quem chama continua com o que já tinha).
export function aplicarHints(texto, hints) {
  const resultado = {};
  if (!texto || !hints || !hints.length) return resultado;
  const alvo = texto.toLowerCase();
  for (const hint of hints) {
    if (hint.campo === 'tipo') { if (hint.valor_exemplo) resultado.tipo = hint.valor_exemplo; continue; }
    const regex = REGEX_POR_CAMPO[hint.campo];
    if (!regex || !hint.ancora) continue;
    const idx = alvo.indexOf(hint.ancora.toLowerCase());
    if (idx === -1) continue;
    const janela = texto.slice(idx + hint.ancora.length, idx + hint.ancora.length + JANELA_ANCORA);
    const m = janela.match(regex);
    if (!m) continue;
    if (hint.campo === 'valor') {
      const v = paraNumeroBr(m[1]);
      if (v !== null) resultado.valor = v;
    } else if (hint.campo === 'numeroNota') {
      resultado.numeroNota = m[1].replace(/[.\-\/]/g, '');
    } else {
      resultado[hint.campo] = m[1];
    }
  }
  return resultado;
}

// A partir do valor que a pessoa escolheu (resposta ao "qual desses é o
// X?"), acha a âncora: o trecho de texto logo ANTES da primeira ocorrência
// desse valor no texto original -- é o que a próxima nota do mesmo
// fornecedor vai procurar pra achar o valor de novo. Vazio quando o valor
// não aparece literalmente no texto (ex: pessoa digitou um valor que o
// leitor nem chegou a reconhecer como candidato) -- nesse caso não tem
// como aprender uma âncora, só corrige a nota atual.
const TAMANHO_ANCORA = 40;
export function derivarAncora(texto, valorEscolhido) {
  if (!texto || !valorEscolhido) return '';
  const idx = texto.indexOf(String(valorEscolhido));
  if (idx === -1) return '';
  const inicio = Math.max(0, idx - TAMANHO_ANCORA);
  return texto.slice(inicio, idx).trim().toLowerCase();
}

// Candidatos pra oferecer como resposta rápida quando um campo não foi
// encontrado -- qualquer trecho do texto que pareça o formato do campo
// (solto, sem âncora nenhuma: é justamente o que a extração genérica não
// conseguiu decidir sozinha, por isso pergunta).
const CANDIDATOS_REGEX = {
  numeroNota: /\b\d{3,}\b/g,
  valor: /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})/g,
  cnpj: /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g,
  cpf: /\d{3}\.\d{3}\.\d{3}-\d{2}/g,
  data: /\d{2}\/\d{2}\/\d{4}/g,
};

export function candidatosParaCampo(campo, texto, limite = 5) {
  const regex = CANDIDATOS_REGEX[campo];
  if (!regex || !texto) return [];
  const re = new RegExp(regex.source, regex.flags);
  const vistos = new Set();
  const candidatos = [];
  let m;
  while ((m = re.exec(texto)) && candidatos.length < limite) {
    const valor = campo === 'valor' ? m[1] : m[0];
    if (!vistos.has(valor)) { vistos.add(valor); candidatos.push(valor); }
  }
  return candidatos;
}

const PERGUNTA_POR_CAMPO = {
  numeroNota: 'Não achei o número da nota nesse documento. Qual é?',
  valor: 'Não achei o valor nesse documento. Qual é?',
  tipo: 'Não consegui identificar o tipo desse documento. Qual desses é?',
};

// analise: { tipoDetectado, campos, texto } de um item de
// app.anexosAnalises. Devolve as perguntas pendentes -- só os campos que
// a auditoria de fato compara com o formulário (número da nota e valor,
// ver documentos_obrigatorios.js) mais o tipo, quando "não identificado".
// candidatos vem null pro tipo (a UI oferece a lista fixa de tipos, ver
// TIPO_DOCUMENTO_LABEL em leitor_documentos.js -- não importado aqui de
// propósito, pra não criar dependência circular com esse módulo).
export function perguntasPendentes(analise) {
  if (!analise || !analise.texto) return [];
  const perguntas = [];
  if (analise.tipoDetectado === 'nao_identificado') {
    perguntas.push({ campo: 'tipo', pergunta: PERGUNTA_POR_CAMPO.tipo, candidatos: null });
  }
  const campos = analise.campos || {};
  if (campos.numeroNota === undefined) {
    perguntas.push({ campo: 'numeroNota', pergunta: PERGUNTA_POR_CAMPO.numeroNota, candidatos: candidatosParaCampo('numeroNota', analise.texto) });
  }
  if (campos.valor === undefined) {
    perguntas.push({ campo: 'valor', pergunta: PERGUNTA_POR_CAMPO.valor, candidatos: candidatosParaCampo('valor', analise.texto) });
  }
  return perguntas;
}
