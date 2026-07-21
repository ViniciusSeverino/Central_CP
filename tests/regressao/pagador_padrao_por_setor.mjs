// Pré-preenchimento de pagador por setor (pedido do dono do produto,
// ponto 2): Operações -> Condomínio, Marketing -> FPP, Financeiro ->
// Consórcio (ver pagadorPadraoParaSetor em state.js). Só um valor
// inicial editável (o campo pagador continua um <select> comum, nunca
// travado) -- cobre os 3 mapeamentos direto na função pura, sem precisar
// de um recebedor de fixture pra cada setor.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { erros } = await bootApp(PERFIS.departamentoRecebedor);
const { pagadorPadraoParaSetor, app } = await import('./app/src/js/state.js');

const pag = (nome) => app.cadastros.pagadores.find(p => p.nome === nome).id;

checarIgual(pagadorPadraoParaSetor('Operações'), pag('Condomínio'), 'Operações -> Condomínio');
checarIgual(pagadorPadraoParaSetor('Marketing'), pag('FPP'), 'Marketing -> FPP');
checarIgual(pagadorPadraoParaSetor('Financeiro'), pag('Consórcio'), 'Financeiro -> Consórcio');
checarIgual(pagadorPadraoParaSetor(null), null, 'sem setor, não sugere nenhum pagador');

checarSemErrosNaoTratados(erros, 'pagador_padrao_por_setor');
relatorioFinal('pagador_padrao_por_setor');
