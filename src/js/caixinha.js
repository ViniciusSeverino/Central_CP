// src/js/caixinha.js
//
// Lógica pura da Caixinha (fundo fixo): saldo calculado a partir do
// histórico de movimentações -- só testável sem DOM, ver ui_caixinha.js
// pra exibição e events_caixinha.js pro wiring.
//
// Só movimentação APROVADA afeta o saldo -- pendente ainda não sabemos se
// vai ser aceita, rejeitada nunca afetou de verdade o cofre.
//
// Sem valor-teto (removido -- pedido do dono do produto: o controle é só
// o saldo que já foi adicionado, sem nenhum limite configurado de
// referência). Antes o "teto" também servia de saldo inicial da fórmula
// (teto - saídas + reforços); agora o saldo nasce em zero e só existe o
// que entrou/saiu de verdade por uma movimentação registrada.
export function saldoCaixinha(caixinha, movimentacoes) {
  const doCaixinha = movimentacoes.filter(m => m.caixinha_id === caixinha.id && m.status === 'aprovado');
  const saidas = doCaixinha.filter(m => m.tipo === 'saida').reduce((s, m) => s + m.valor, 0);
  const reforcos = doCaixinha.filter(m => m.tipo === 'reforco').reduce((s, m) => s + m.valor, 0);
  return reforcos - saidas;
}

// Relatório de compliance: saídas já aprovadas sem comprovante anexado --
// útil tanto pra auditar o passado (achar os casos perdidos pelo bug de
// RLS corrigido em 0046, onde o arquivo subia mas o caminho nunca era
// salvo) quanto como checagem de rotina daqui pra frente. Só saída conta
// (é o dinheiro saindo que precisa de comprovante de compra) -- reforço
// fica de fora de propósito.
export function saidasAprovadasSemComprovante(movimentacoes) {
  return movimentacoes.filter(m => m.tipo === 'saida' && m.status === 'aprovado' && !m.comprovante);
}

// Extrato (relatório): mesmas movimentações aprovadas de saldoCaixinha,
// mas em ordem cronológica com o saldo ACUMULADO após cada uma -- como um
// extrato bancário. O saldo acumulado é sempre calculado sobre o
// histórico INTEIRO antes de aplicar o filtro de período (senão o saldo
// de uma linha filtrada não bateria com o saldo de verdade da caixinha
// naquele momento -- um extrato "de agosto" ainda precisa refletir tudo
// que já tinha acontecido antes de agosto).
export function extratoCaixinha(caixinha, movimentacoes, filtro) {
  const f = filtro || {};
  const doCaixinha = movimentacoes
    .filter(m => m.caixinha_id === caixinha.id && m.status === 'aprovado')
    .slice()
    .sort((a, b) => {
      const porData = new Date(a.data) - new Date(b.data);
      if (porData !== 0) return porData;
      return new Date(a.criado_em) - new Date(b.criado_em);
    });
  let saldo = 0;
  const linhas = doCaixinha.map(m => {
    saldo += m.tipo === 'reforco' ? m.valor : -m.valor;
    return { ...m, saldo_apos: saldo };
  });
  return linhas.filter(l => {
    if (f.dataDe && l.data < f.dataDe) return false;
    if (f.dataAte && l.data > f.dataAte) return false;
    return true;
  });
}
