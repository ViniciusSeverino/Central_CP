// Orçamento do DRE (ver orcamento.js / migration 0055): leitura da
// planilha (código ou classe, por pagador), avisos da prévia e gravação
// substituindo só o ano/pagador importado.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { erros, supabaseClientMod } = await bootApp(PERFIS.administrador);
const { app } = await import('./app/src/js/state.js');
const { planoDoPagador, interpretarOrcamento, orcadoPorConta } = await import('./app/src/js/orcamento.js');
const db = await import('./app/src/js/db.js');

const pag = app.cadastros.pagadores.find(p => p.sigla === 'COND');
const plano = planoDoPagador(app.cadastros, pag);
checar(plano.length > 0 && plano.every(p => (p.centro.origem_siglas || []).includes('COND')), 'plano do pagador: só os centros dele');
const classe = plano[0].classes[0].classe;
const codigo = plano[0].classes[0].codigos[0];

const meses = (v) => Array.from({ length: 12 }, (_, i) => (i < 2 ? v : null));
const r = interpretarOrcamento([
  { codigo: codigo.codigo, meses: meses(1000) },
  { codigo: classe.codigo, meses: meses(5000) },      // mesma classe também por código -> ignorada
  { codigo: '9.99.99', meses: meses(1) },             // não existe
  { codigo: 'Título qualquer', meses: meses(1) },      // texto: ignorado em silêncio
  { codigo: codigo.codigo + 'X', meses: ['abc', ...Array(11).fill(null)] },
], app.cadastros, pag);
checarIgual(r.registros.length, 2, 'código com 2 meses = 2 registros');
checarIgual(r.total, 2000, 'total da prévia');
checarIgual(r.classesIgnoradas, [classe.codigo], 'classe orçada também por código: vale o código (sem contar em dobro)');
checarIgual(r.naoReconhecidos, ['9.99.99'], 'código fora do plano aparece na prévia');
checarIgual(r.invalidos.length, 1, 'valor que não é número aparece na prévia');
checarIgual(interpretarOrcamento([{ codigo: classe.codigo, meses: ['1.234,56', ...Array(11).fill(null)] }], app.cadastros, pag).total, 1234.56, 'aceita valor em texto no formato brasileiro');

console.log('### Gravação ###');
await db.substituirOrcamento(pag.id, 2026, r.registros, app.usuario);
await db.substituirOrcamento(pag.id, 2025, [{ mes: 1, codigo_classificacao_id: codigo.id, valor: 7 }], app.usuario);
await db.substituirOrcamento(pag.id, 2026, [{ mes: 3, codigo_classificacao_id: codigo.id, valor: 300 }], app.usuario);
const gravado = supabaseClientMod.__fixtures().orcamento;
checarIgual(gravado.filter(o => o.ano === 2026).map(o => o.valor), [300], 'reimportar substitui o ano daquele pagador');
checarIgual(gravado.filter(o => o.ano === 2025).length, 1, 'outros anos não são tocados');
checarIgual(orcadoPorConta(gravado, pag.id, 2026).get(codigo.id)[2], 300, 'modelo vem pré-preenchido com o que está gravado');

checarSemErrosNaoTratados(erros, 'orcamento_importacao');
console.log('### Receitas no orçamento ###');
const rr = interpretarOrcamento([
  { codigo: 'R-*Aluguel Mínimo', meses: meses(3000) },
  { codigo: codigo.codigo, meses: meses(10) },
], app.cadastros, pag);
checarIgual(rr.registros.filter(x => x.receita_classe).map(x => [x.mes, x.receita_classe, x.valor]), [[1, 'ALUGUEL MÍNIMO', 3000], [2, 'ALUGUEL MÍNIMO', 3000]], 'linha R-<classe> grava receita_classe (classe normalizada)');
checarIgual([rr.total, rr.totalReceitas], [20, 6000], 'total da prévia separa despesas e receitas');
checarIgual(orcadoPorConta([{ pagador_id: pag.id, ano: 2026, mes: 3, receita_classe: 'ALUGUEL MÍNIMO', valor: 7 }], pag.id, 2026).get('R:ALUGUEL MÍNIMO')[2], 7, 'orçado gravado de receita pré-preenche o modelo');

relatorioFinal('orcamento_importacao');
