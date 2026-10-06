// Nome do PDF final de cada nota (ver nomeArquivoFinal em anexos_pdf.js):
// pagador ANTES de BSB (pedido do dono do produto, out/2026), siglas das
// formas de pagamento (inclusive Débito automático = DDA) e a conversão
// dos nomes antigos (nomeNovoPadrao).
import { checar, checarIgual, relatorioFinal } from './lib/assert.mjs';
const { nomeArquivoFinal, siglaFormaPagamento, nomeNovoPadrao } = await import('./app/src/js/anexos_pdf.js');

checarIgual(
  nomeArquivoFinal({ pagadorSigla: 'COND', vencimento: '2026-11-11', fornecedorNome: 'GSBRU Administração de Condomínios', numeroNota: 'NF-16412', formaPagamento: 'TED' }),
  'COND_BSB_11-11_GSBRU_ADMINISTRACAO_DE_CONDOMINIOS_NF16412_TED.pdf',
  'pagador vem antes de BSB',
);
checarIgual(siglaFormaPagamento('Boleto bancário'), 'BOLETO', 'Boleto bancário -> BOLETO');
checarIgual(siglaFormaPagamento('Pix'), 'PIX', 'Pix -> PIX');
checarIgual(siglaFormaPagamento('Débito automático'), 'DDA', 'Débito automático -> DDA');
checarIgual(
  nomeArquivoFinal({ pagadorSigla: '', vencimento: null, fornecedorNome: 'X', numeroNota: '', formaPagamento: 'Pix' }),
  'SEMPAG_BSB_SEMDATA_X_NFSEMNF_PIX.pdf',
  'sem pagador/vencimento/NF continua gerando um nome válido',
);

console.log('### Conversão dos nomes antigos ###');
checarIgual(nomeNovoPadrao('nota-5/BSB_COND_01-06_FORNECEDOR_4_NF5_BOLETO.pdf'), 'nota-5/COND_BSB_01-06_FORNECEDOR_4_NF5_BOLETO.pdf', 'BSB_COND_ -> COND_BSB_, mantendo a pasta da nota');
checarIgual(nomeNovoPadrao('nota-5/COND_BSB_01-06_FORNECEDOR_4_NF5_BOLETO.pdf'), null, 'nome já no padrão novo: nada a fazer');
checarIgual(nomeNovoPadrao('nota-1/123-boleto.pdf'), null, 'arquivo fora do padrão: não mexe');
const novo = nomeNovoPadrao('n/BSB_FPP_02-02_A_NF1_TED.pdf');
checar(novo === 'n/FPP_BSB_02-02_A_NF1_TED.pdf' && nomeNovoPadrao(novo) === null, 'rodar de novo no resultado não muda nada (idempotente)');

relatorioFinal('anexos_nome_arquivo_padrao');
