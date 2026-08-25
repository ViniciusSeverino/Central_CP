// caixinha.js: saidasAprovadasSemComprovante() -- relatório de compliance
// (ver ui_caixinha.js/renderCaixinha, filtro "Só saídas aprovadas sem
// comprovante"). Só saída aprovada sem comprovante conta -- reforço,
// pendente/rejeitado e saída COM comprovante ficam de fora.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checarIgual, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { erros } = await bootApp(PERFIS.administrador);
const { saidasAprovadasSemComprovante } = await import('./app/src/js/caixinha.js');

const movimentacoes = [
  { id: 'm1', caixinha_id: 'cx-1', tipo: 'saida', valor: 100, status: 'aprovado', comprovante: null },
  { id: 'm2', caixinha_id: 'cx-1', tipo: 'saida', valor: 200, status: 'aprovado', comprovante: 'cx-1/123-nota.pdf' },
  { id: 'm3', caixinha_id: 'cx-2', tipo: 'saida', valor: 300, status: 'pendente_aprovacao', comprovante: null },
  { id: 'm4', caixinha_id: 'cx-2', tipo: 'saida', valor: 400, status: 'rejeitado', comprovante: null },
  { id: 'm5', caixinha_id: 'cx-1', tipo: 'reforco', valor: 500, status: 'aprovado', comprovante: null },
];

const resultado = saidasAprovadasSemComprovante(movimentacoes);
checarIgual(resultado.length, 1, 'só a saída aprovada sem comprovante (m1) entra no relatório');
checarIgual(resultado[0].id, 'm1', 'a linha do relatório é a m1');

checarSemErrosNaoTratados(erros, 'caixinha_saidas_sem_comprovante');
relatorioFinal('caixinha_saidas_sem_comprovante');
