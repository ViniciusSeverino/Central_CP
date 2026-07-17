// src/js/caixinha.js
//
// Lógica pura da Caixinha (fundo fixo): saldo calculado a partir do
// histórico de movimentações -- só testável sem DOM, ver ui_caixinha.js
// pra exibição e events_caixinha.js pro wiring.
//
// Só movimentação APROVADA afeta o saldo -- pendente ainda não sabemos se
// vai ser aceita, rejeitada nunca afetou de verdade o cofre.
export function saldoCaixinha(caixinha, movimentacoes) {
  const doCaixinha = movimentacoes.filter(m => m.caixinha_id === caixinha.id && m.status === 'aprovado');
  const saidas = doCaixinha.filter(m => m.tipo === 'saida').reduce((s, m) => s + m.valor, 0);
  const reforcos = doCaixinha.filter(m => m.tipo === 'reforco').reduce((s, m) => s + m.valor, 0);
  return caixinha.valor_teto - saidas + reforcos;
}
