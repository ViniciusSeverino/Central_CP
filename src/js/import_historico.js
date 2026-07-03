// src/js/import_historico.js
//
// Importação de histórico (só administrador): lê o mesmo modelo de colunas
// que "Exportar Excel" já gera (aba "Notas"), reagrupa linhas com o mesmo
// Nº NF + Fornecedor de volta numa nota só (rateada quando há mais de uma
// linha do grupo), resolve nomes pra cadastros existentes, e prepara tudo
// pra inserir.
//
// A parte que lê o .xlsx de verdade (exceljs) fica em events_importar.js —
// aqui só a lógica pura de agrupar/resolver/validar (nenhuma chamada de
// rede, nenhum DOM), pra dar pra testar com objetos simples.
import { STATUS_LABEL, SETORES } from './state.js';

// Mesma ordem/nome de colunas que export_excel.js usa na aba "Notas" — o
// parser em events_importar.js lê pelo NOME da coluna (linha 1), não pela
// posição, então a ordem aqui é só documentação/referência.
export const COLUNAS_IMPORTACAO = [
  'Nº NF', 'Fornecedor', 'CNPJ', 'Pagador', 'Setor solicitante',
  'Data emissão', 'Vencimento', 'Competência', 'Valor da linha',
  'Forma de pagamento', 'Conta bancária', 'Classificação',
  'Centro de custo', 'Classe da conta', 'Código classificação',
  'Status', 'Pendente', 'Motivo da pendência',
  'Solicitado por', 'Aprovado por', 'Data aprovação',
  'Nº lançamento Group', 'Data lançamento Group',
  'Nº chamado Acelerato', 'Data chamado', 'Data validação CSC',
  'Validado por', 'Data pagamento',
];

const FORMAS_PAGAMENTO_VALIDAS = ['Boleto bancário', 'TED', 'Pix'];
const CLASSIFICACOES_VALIDAS = ['Compras', 'Serviço', 'Outros'];

function normalizar(v) { return v == null ? '' : String(v).trim(); }
function chave(v) { return normalizar(v).toLowerCase(); }

function porNomeExato(nome, lista) {
  const alvo = chave(nome);
  if (!alvo || !lista) return null;
  return lista.find(it => chave(it.nome) === alvo) || null;
}

function porCnpjOuNome(cnpj, nome, fornecedores) {
  const cnpjDigits = normalizar(cnpj).replace(/\D/g, '');
  if (cnpjDigits) {
    const porCnpj = fornecedores.find(f => normalizar(f.cnpj).replace(/\D/g, '') === cnpjDigits);
    if (porCnpj) return porCnpj;
  }
  return porNomeExato(nome, fornecedores);
}

// Célula vem como "código – nome" (mesmo formato de labelOf() na
// exportação) ou só o nome — tenta pelo código primeiro (mais confiável),
// depois pelo texto inteiro, depois só pelo nome.
function porCodigoOuNome(valor, lista) {
  const texto = normalizar(valor);
  if (!texto || !lista) return null;
  const partes = texto.split('–');
  if (partes.length >= 2) {
    const cod = chave(partes[0]);
    const porCodigo = lista.find(it => chave(it.codigo) === cod);
    if (porCodigo) return porCodigo;
  }
  return lista.find(it => chave(`${it.codigo || ''} – ${it.nome}`) === chave(texto))
    || lista.find(it => chave(it.codigo) === chave(texto))
    || porNomeExato(texto, lista);
}

function enumValido(valor, validos) {
  const alvo = chave(valor);
  return validos.find(v => chave(v) === alvo) || null;
}

function paraBooleanoSimNao(valor) { return chave(valor) === 'sim'; }

function paraNumero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return valor;
  const limpo = String(valor).trim()
    .replace(/[^\d,.\-]/g, '')
    .replace(/\.(?=\d{3}(?:[,.]|$))/g, '')
    .replace(',', '.');
  const n = parseFloat(limpo);
  return isNaN(n) ? null : n;
}

function paraDataISO(valor) {
  if (!valor) return null;
  if (valor instanceof Date && !isNaN(valor.getTime())) return valor.toISOString().slice(0, 10);
  const texto = normalizar(valor);
  const m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

function paraCompetenciaISO(valor) {
  if (!valor) return null;
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return `${valor.getFullYear()}-${String(valor.getMonth() + 1).padStart(2, '0')}-01`;
  }
  const texto = normalizar(valor);
  const m = texto.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}-01`;
  return paraDataISO(texto);
}

function construirMapaStatus() {
  const mapa = { [chave('Rascunho')]: 'rascunho' };
  Object.entries(STATUS_LABEL).forEach(([k, label]) => { mapa[chave(label)] = k; });
  return mapa;
}
const MAPA_STATUS = construirMapaStatus();

// linhasCruas: array de objetos com as chaves em snake_case (ver
// COLUNAS_IMPORTACAO -> mapeamento feito em events_importar.js ao ler o
// arquivo). cadastros/usuarios/notasExistentes/usuarioImportador vêm de
// app.cadastros / app.usuarios / app.notas / app.usuario — passados
// explicitamente (em vez de importar `app` direto) pra essa função dar
// pra testar com fixtures simples, sem precisar montar o estado inteiro.
export function processarLinhasImportacao(linhasCruas, { cadastros, usuarios, notasExistentes, usuarioImportador }) {
  const erros = [];
  const avisos = [];
  const grupos = new Map();

  linhasCruas.forEach((linha, i) => {
    const numeroPlanilha = i + 2; // linha 1 = cabeçalho
    const fornecedorNome = normalizar(linha.fornecedor);
    const valorLinha = paraNumero(linha.valor_bruto);
    if (!fornecedorNome || valorLinha === null || valorLinha <= 0) {
      erros.push({ linhas: String(numeroPlanilha), motivo: 'Faltou Fornecedor ou Valor bruto — mínimo pra importar essa linha.' });
      return;
    }
    const grp = `${chave(linha.numero_nota)}|${chave(fornecedorNome)}`;
    if (!grupos.has(grp)) grupos.set(grp, []);
    grupos.get(grp).push({ ...linha, _numeroPlanilha: numeroPlanilha, _valorLinha: valorLinha });
  });

  const prontas = [];

  grupos.forEach(linhas => {
    const numerosPlanilha = linhas.map(l => l._numeroPlanilha).join(', ');
    const primeira = linhas[0];

    const fornecedor = porCnpjOuNome(primeira.cnpj, primeira.fornecedor, cadastros.fornecedores);
    if (!fornecedor) {
      erros.push({ linhas: numerosPlanilha, motivo: `Fornecedor "${primeira.fornecedor}" não encontrado nos cadastros.` });
      return;
    }

    let pagador = null;
    if (primeira.pagador) {
      pagador = porNomeExato(primeira.pagador, cadastros.pagadores);
      if (!pagador) { erros.push({ linhas: numerosPlanilha, motivo: `Pagador "${primeira.pagador}" não encontrado nos cadastros.` }); return; }
    }

    let setor = null;
    if (primeira.setor) {
      setor = enumValido(primeira.setor, SETORES);
      if (!setor) { erros.push({ linhas: numerosPlanilha, motivo: `Setor "${primeira.setor}" inválido (use ${SETORES.join(', ')}).` }); return; }
    }

    let formaPagamento = null;
    if (primeira.forma_pagamento) {
      formaPagamento = enumValido(primeira.forma_pagamento, FORMAS_PAGAMENTO_VALIDAS);
      if (!formaPagamento) { erros.push({ linhas: numerosPlanilha, motivo: `Forma de pagamento "${primeira.forma_pagamento}" inválida (use ${FORMAS_PAGAMENTO_VALIDAS.join(', ')}).` }); return; }
    }

    let classificacao = null;
    if (primeira.classificacao) {
      classificacao = enumValido(primeira.classificacao, CLASSIFICACOES_VALIDAS);
      if (!classificacao) { erros.push({ linhas: numerosPlanilha, motivo: `Classificação "${primeira.classificacao}" inválida (use ${CLASSIFICACOES_VALIDAS.join(', ')}).` }); return; }
    }

    // Histórico sem status informado: assume "Pago" (é o caso mais comum
    // pra dado histórico — um processo já concluído antes do Central CP
    // existir). Fica registrado como aviso, não erro, pra não travar a
    // importação por causa de uma coluna opcional.
    let status = 'pago';
    let statusPadrao = true;
    if (primeira.status) {
      const resolvido = MAPA_STATUS[chave(primeira.status)];
      if (!resolvido) { erros.push({ linhas: numerosPlanilha, motivo: `Status "${primeira.status}" não reconhecido.` }); return; }
      status = resolvido;
      statusPadrao = false;
    }

    const temRateio = linhas.length > 1;
    let centroCustoId = null, classeContaId = null, codigoClassificacaoId = null;
    const rateios = [];

    if (temRateio) {
      let falhou = null;
      for (const l of linhas) {
        const centro = l.centro_custo ? porCodigoOuNome(l.centro_custo, cadastros.centros_custo) : null;
        const classe = l.classe_conta ? porCodigoOuNome(l.classe_conta, cadastros.classes_conta) : null;
        if (!centro || !classe) { falhou = `Linha ${l._numeroPlanilha}: rateio precisa de Centro de custo e Classe da conta reconhecidos.`; break; }
        const codigo = l.codigo_classificacao ? porCodigoOuNome(l.codigo_classificacao, cadastros.codigos_classificacao) : null;
        rateios.push({ valor: l._valorLinha, centro_custo_id: centro.id, classe_conta_id: classe.id, codigo_classificacao_id: codigo ? codigo.id : null, descricao: null });
      }
      if (falhou) { erros.push({ linhas: numerosPlanilha, motivo: falhou }); return; }
    } else {
      if (primeira.centro_custo) {
        const centro = porCodigoOuNome(primeira.centro_custo, cadastros.centros_custo);
        if (!centro) { erros.push({ linhas: numerosPlanilha, motivo: `Centro de custo "${primeira.centro_custo}" não encontrado.` }); return; }
        centroCustoId = centro.id;
      }
      if (primeira.classe_conta) {
        const classe = porCodigoOuNome(primeira.classe_conta, cadastros.classes_conta);
        if (!classe) { erros.push({ linhas: numerosPlanilha, motivo: `Classe da conta "${primeira.classe_conta}" não encontrada.` }); return; }
        classeContaId = classe.id;
      }
      if (primeira.codigo_classificacao) {
        const codigo = porCodigoOuNome(primeira.codigo_classificacao, cadastros.codigos_classificacao);
        if (codigo) codigoClassificacaoId = codigo.id;
      }
    }

    const valorBruto = temRateio ? rateios.reduce((s, r) => s + r.valor, 0) : primeira._valorLinha;

    const numeroNota = normalizar(primeira.numero_nota);
    if (numeroNota) {
      const duplicada = (notasExistentes || []).some(n => n.fornecedor_id === fornecedor.id && chave(n.numero_nota) === chave(numeroNota));
      if (duplicada) {
        avisos.push({ linhas: numerosPlanilha, motivo: `NF ${numeroNota} já existe pra esse fornecedor — linha pulada.`, pulou: true });
        return;
      }
    }

    if (statusPadrao) avisos.push({ linhas: numerosPlanilha, motivo: 'Status não informado — assumido como "Pago".', pulou: false });

    // "Solicitado por": vira sempre texto de referência, nunca aponta pra
    // uma conta de verdade — quem fica registrado como dono do lançamento
    // é sempre o administrador que está importando (é uma exigência do
    // RLS: só dá pra criar nota em nome de quem está logado).
    const solicitanteHistorico = normalizar(primeira.solicitado_por) || null;
    const aprovadoPor = primeira.aprovado_por ? porNomeExato(primeira.aprovado_por, usuarios) : null;
    const validadoPor = primeira.validado_por ? porNomeExato(primeira.validado_por, usuarios) : null;

    prontas.push({
      numero_nota: numeroNota || null,
      fornecedor_id: fornecedor.id,
      pagador_id: pagador ? pagador.id : null,
      setor,
      data_emissao: paraDataISO(primeira.data_emissao),
      vencimento: paraDataISO(primeira.vencimento),
      competencia: paraCompetenciaISO(primeira.competencia),
      valor_bruto: valorBruto,
      forma_pagamento: formaPagamento,
      conta_bancaria_id: null, // texto livre na exportação, sem id confiável pra resolver de volta
      classificacao,
      tem_rateio: temRateio,
      centro_custo_id: centroCustoId,
      classe_conta_id: classeContaId,
      codigo_classificacao_id: codigoClassificacaoId,
      rateios,
      status,
      pendente: paraBooleanoSimNao(primeira.pendente),
      motivo_pendencia: normalizar(primeira.motivo_pendencia) || null,
      criado_por: usuarioImportador.id,
      solicitante_historico: solicitanteHistorico,
      aprovado_por: aprovadoPor ? aprovadoPor.id : null,
      data_aprovacao: paraDataISO(primeira.data_aprovacao),
      numero_lancamento_group: normalizar(primeira.numero_lancamento_group) || null,
      data_lancamento_group: paraDataISO(primeira.data_lancamento_group),
      numero_chamado: normalizar(primeira.numero_chamado) || null,
      data_chamado: paraDataISO(primeira.data_chamado),
      data_validacao_csc: paraDataISO(primeira.data_validacao_csc),
      validado_por: validadoPor ? validadoPor.id : null,
      data_pagamento: paraDataISO(primeira.data_pagamento),
      _linhasPlanilha: numerosPlanilha,
    });
  });

  return { prontas, erros, avisos };
}
