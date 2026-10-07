// Aba "Resultado (DRE)" da Visão geral (ver ui_dre.js): por enquanto SÓ o
// administrador vê; os demais continuam com a Visão geral de sempre.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const perfil = process.env.DRE_PERFIL;
if (perfil) {
  // Rodada filha: só confere que esse perfil NÃO vê o DRE.
  const { document, erros } = await bootApp(PERFIS[perfil]);
  const { app } = await import('./app/src/js/state.js');
  const { render } = await import('./app/src/js/app.js');
  app.state.view = 'dashboard'; render();
  await new Promise(r => setTimeout(r, 30));
  checar(!document.querySelector('[data-dash-aba]') && !document.querySelector('[data-dre-pagador]'), `${perfil}: sem aba DRE`);
  checar(!!document.querySelector('.dash-tiles'), `${perfil}: Visão geral de sempre continua lá`);
  checarSemErrosNaoTratados(erros, `dre_tela:${perfil}`);
  relatorioFinal(`dre_tela:${perfil}`);
} else {
  const { execFileSync } = await import('child_process');
  for (const p of ['gerenteFinanceiro', 'contasAPagar', 'departamento']) {
    try {
      const saida = execFileSync('node', [new URL(import.meta.url).pathname], { env: { ...process.env, DRE_PERFIL: p }, encoding: 'utf8' });
      checar(!/FALHOU/.test(saida), `${p} não vê o DRE`);
    } catch (e) { checar(false, `${p} não vê o DRE (${(e.stdout || e.message).split('\n').filter(l => l.includes('FALHOU')).join(' ')})`); }
  }

  const { document, erros } = await bootApp(PERFIS.administrador);
  const { app } = await import('./app/src/js/state.js');
  const { render } = await import('./app/src/js/app.js');
  const esperar = (ms) => new Promise(r => setTimeout(r, ms));
  app.state.view = 'dashboard'; app.state.dashboardMes = '2026-06';
  render(); await esperar(30);

  console.log('### Administrador ###');
  checar(!!document.querySelector('[data-dash-aba="dre"].active'), 'administrador abre a Visão geral no DRE');
  checar(document.querySelectorAll('[data-dre-pagador]').length === app.cadastros.pagadores.length, 'um botão por pagador');
  const centros = document.querySelectorAll('.dre-tabela tr.dre-n1');
  checar(centros.length > 0, `árvore mostra os centros de custo (${centros.length})`);
  checar(!document.querySelector('.dre-tabela tr.dre-n2'), 'classes começam recolhidas');

  document.querySelector('[data-dre-toggle^="c:"]').click(); await esperar(20);
  checar(!!document.querySelector('.dre-tabela tr.dre-n2'), 'expandir um centro mostra as classes');
  document.querySelector('[data-dre-toggle^="cl:"]').click(); await esperar(20);
  const cod = document.querySelector('[data-dre-codigo]');
  checar(!!cod, 'expandir a classe mostra os códigos');
  cod.click(); await esperar(20);
  checar(!!document.querySelector('.dre-detalhe [data-open]'), 'clicar no código abre o detalhamento com as notas (clicáveis)');
  document.querySelector('.dre-detalhe [data-open]').click(); await esperar(30);
  checarIgual(app.state.modal, 'detalhe', 'clicar numa nota do detalhamento abre o detalhe da nota');

  app.state.modal = null; render(); await esperar(20);
  document.querySelector('[data-dre-regime="caixa"]').click(); await esperar(20);
  checarIgual(app.state.dre.regime, 'caixa', 'troca para regime de caixa');
  document.querySelector('[data-dre-acumulado="sim"]').click(); await esperar(20);
  checar(app.state.dre.acumulado && document.querySelector('.dre-tabela thead').textContent.includes('Ano anterior'), 'acumulado no ano compara com o ano anterior');
  const outro = document.querySelectorAll('[data-dre-pagador]')[1];
  if (outro) { outro.click(); await esperar(20); checarIgual(app.state.dre.pagadorId, outro.dataset.drePagador, 'troca de pagador'); }
  document.querySelector('[data-dash-aba="esteira"]').click(); await esperar(20);
  checar(!document.querySelector('.dre-tabela') && !!document.querySelector('.dash-alertas'), 'aba Esteira mostra o painel de sempre');

  checarSemErrosNaoTratados(erros, 'dre_tela');
  relatorioFinal('dre_tela');
}
