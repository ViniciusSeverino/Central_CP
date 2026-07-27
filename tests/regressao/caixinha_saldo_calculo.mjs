// caixinha.js: saldoCaixinha() -- lógica pura do fundo fixo. Só
// movimentação aprovada afeta o saldo (pendente ainda não sabemos se vai
// ser aceita, rejeitada nunca afetou de verdade o cofre).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checarIgual, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { erros } = await bootApp(PERFIS.administrador);
const { saldoCaixinha } = await import('./app/src/js/caixinha.js');

const caixinha = { id: 'cx-1' };
const movimentacoes = [
  { caixinha_id: 'cx-1', tipo: 'reforco', valor: 1000, status: 'aprovado' },
  { caixinha_id: 'cx-1', tipo: 'saida', valor: 200, status: 'aprovado' },
  { caixinha_id: 'cx-1', tipo: 'saida', valor: 999, status: 'pendente_aprovacao' }, // não conta ainda
  { caixinha_id: 'cx-1', tipo: 'saida', valor: 999, status: 'rejeitado' }, // nunca conta
  { caixinha_id: 'cx-1', tipo: 'reforco', valor: 100, status: 'aprovado' },
  { caixinha_id: 'cx-2', tipo: 'saida', valor: 500, status: 'aprovado' }, // outra caixinha, não conta
];

checarIgual(saldoCaixinha(caixinha, movimentacoes), 900, 'saldo = reforços aprovados (1000+100) - saídas aprovadas (200), ignora pendente/rejeitado/outra caixinha');
checarIgual(saldoCaixinha({ id: 'cx-1' }, []), 0, 'sem nenhuma movimentação, saldo é zero (sem teto/saldo inicial)');

checarSemErrosNaoTratados(erros, 'caixinha_saldo_calculo');
relatorioFinal('caixinha_saldo_calculo');
