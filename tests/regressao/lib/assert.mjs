// tests/regressao/lib/assert.mjs
//
// Helper mínimo pra transformar os drivers de "imprime e espera alguém
// ler" em testes de verdade: cada checagem que falha marca o processo
// pra sair com código != 0, que é o que o GitHub Actions usa pra decidir
// se o PR passou ou não. Sem isso, um driver podia imprimir "esperado 2,
// veio 3" e a suíte inteira continuava "verde".
let falhas = 0;
let checagens = 0;

export function checar(condicao, mensagem) {
  checagens++;
  if (condicao) {
    console.log(`  ✓ ${mensagem}`);
  } else {
    falhas++;
    console.error(`  ✗ FALHOU: ${mensagem}`);
  }
  return condicao;
}

export function checarIgual(valorObtido, valorEsperado, mensagem) {
  const ok = JSON.stringify(valorObtido) === JSON.stringify(valorEsperado);
  return checar(ok, `${mensagem} (esperado ${JSON.stringify(valorEsperado)}, veio ${JSON.stringify(valorObtido)})`);
}

// Chamado no fim de cada driver — imprime o placar e define o exit code
// do processo. process.exitCode (em vez de process.exit()) deixa o loop
// de eventos drenar sozinho, sem cortar nada no meio.
export function relatorioFinal(nomeSuite) {
  const passou = checagens - falhas;
  console.log(`\n${nomeSuite}: ${passou}/${checagens} checagens passaram`);
  if (falhas > 0) {
    console.error(`${nomeSuite}: ${falhas} falha(s)`);
    process.exitCode = 1;
  }
}

// Global de erro não tratado (evento onerror do jsdom, promise rejeitada
// etc.) -- qualquer coisa aqui também deve reprovar o driver, mesmo que
// nenhuma checagem explícita tenha falhado.
export function checarSemErrosNaoTratados(errosCapturados, nomeSuite) {
  checar(errosCapturados.length === 0, `${nomeSuite}: nenhum erro não tratado (${errosCapturados.length} encontrado(s))`);
  if (errosCapturados.length > 0) {
    errosCapturados.forEach(e => console.error('  erro não tratado:', e));
  }
}
