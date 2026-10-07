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
  app.state.view = 'cadastros'; app.state.configTab = 'orcamento'; render();
  await new Promise(r => setTimeout(r, 30));
  checar(!document.querySelector('[data-config-tab="orcamento"]') && !document.getElementById('btn-modelo-orcamento'), `${perfil}: sem aba Orçamento em Configurações`);
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

  const { dom, document, erros } = await bootApp(PERFIS.administrador);
  const { app } = await import('./app/src/js/state.js');
  const { render } = await import('./app/src/js/app.js');
  const esperar = (ms) => new Promise(r => setTimeout(r, ms));
  app.state.view = 'dashboard'; app.state.dre.ano = 2026;
  render(); await esperar(30);

  console.log('### Administrador ###');
  checar(!!document.querySelector('[data-dash-aba="dre"].active'), 'administrador abre a Visão geral no DRE');
  checar(document.querySelectorAll('[data-dre-pagador]').length === app.cadastros.pagadores.length, 'um botão por pagador');
  checarIgual(document.querySelectorAll('.dre-tabela thead th.dre-mes').length, 12, 'uma coluna por mês');
  checar(document.querySelector('.dre-tabela thead').textContent.includes('Orçado 2026') && document.querySelector('.dre-tabela thead').textContent.includes('Desvio'), 'totais do ano: orçado, realizado e desvio');
  const centros = document.querySelectorAll('.dre-tabela tr.dre-n1');
  checar(centros.length > 0, `árvore mostra os centros de custo (${centros.length})`);
  checar(!document.querySelector('.dre-tabela tr.dre-n2'), 'classes começam recolhidas');

  document.querySelector('[data-dre-toggle^="c:"]').click(); await esperar(20);
  document.querySelector('[data-dre-toggle^="cl:"]').click(); await esperar(20);
  const celMes = document.querySelector('.dre-n3 [data-dre-det-mes]');
  checar(!!celMes, 'células de mês de um código são clicáveis');
  celMes.click(); await esperar(20);
  checar(!!document.querySelector('.dre-detalhe [data-open]') && !!app.state.dre.detalhe.mes, 'clicar na célula abre as notas daquele mês');
  document.querySelector('.dre-detalhe [data-open]').click(); await esperar(30);
  checarIgual(app.state.modal, 'detalhe', 'clicar numa nota do detalhamento abre o detalhe da nota');
  app.state.modal = null; render(); await esperar(20);

  console.log('### Orçado ###');
  // Orçado pela CLASSE das notas do fixture (cl-1), bem abaixo do realizado de junho.
  app.orcamento = [{ pagador_id: app.state.dre.pagadorId, ano: 2026, mes: 6, codigo_classificacao_id: null, classe_conta_id: 'cl-1', valor: 100 }];
  render(); await esperar(20);
  checar(!!document.querySelector('.dre-regua.estourou'), 'com orçado menor que o realizado, a régua do mês aparece em alerta');
  app.state.dre.mesFoco = 6; render(); await esperar(20);
  const desvios = document.querySelectorAll('.dre-foco-lista')[1];
  checar(desvios && desvios.querySelector('li .dre-acima') && desvios.textContent.includes('+'), 'mês em foco: "Maiores desvios vs orçado" lista a conta acima do orçado');
  checar(!!document.querySelector('.dre-leitura li.tom-alerta'), 'leitura do mês traz um alerta (despesa acima do orçado)');
  const exibir = document.getElementById('dre-exibir');
  exibir.value = 'orcado'; exibir.dispatchEvent(new dom.window.Event('change')); await esperar(20);
  checarIgual(app.state.dre.exibir, 'orcado', 'seletor Exibir troca para só orçado');
  checar(!document.querySelector('.dre-regua'), 'em "só orçado" não tem régua');

  checarIgual(document.querySelectorAll('[data-dre-regime]').length, 2, 'só dois regimes: competência e caixa');
  checarIgual(document.querySelectorAll('.dre-cg-mes').length, 12, 'gráfico de colunas: um grupo por mês');
  checar(!document.querySelector('[data-dre-serie]'), 'sem receitas, o gráfico é só de despesas');
  document.querySelectorAll('.dre-cg-mes')[4].click(); await esperar(20);
  checarIgual(app.state.dre.mesFoco, 5, 'clicar no mês do gráfico troca o mês em foco');

  console.log('### Receitas ###');
  app.groupReceitas = [
    { id_group: 1, pagador_id: app.state.dre.pagadorId, classe: 'ALUGUEL MÍNIMO', mes_ref: '06/2026', situacao: 'Baixada', recebimento: '2026-06-10', faturado: 9000, valor_liquido: 9000, vencimento: '2026-06-05' },
    { id_group: 2, pagador_id: app.state.dre.pagadorId, classe: 'ENCARGO COMUM', mes_ref: '06/2026', situacao: 'Emitida', faturado: 1000, valor_liquido: 0, vencimento: '2026-06-05' },
  ];
  exibir.value = 'realizado_orcado'; exibir.dispatchEvent(new dom.window.Event('change')); await esperar(20);
  checarIgual(document.querySelectorAll('[data-dre-serie]').length, 3, 'com receitas: gráfico de despesas, receitas ou resultado');
  checar(!!document.querySelector('[data-dre-toggle="r:alugueis"]') && !!document.querySelector('.dre-resultado'), 'tabela com o bloco de receitas e a linha de resultado');
  checarIgual(document.querySelectorAll('.dre-foco-card').length, 3, 'mês em foco: receita, despesa e resultado');
  checar(document.querySelector('.dre-kpis').textContent.includes('Inadimplência'), 'painel mostra a inadimplência');
  document.querySelector('[data-dre-serie="resultado"]').click(); await esperar(20);
  checar(app.state.dre.serie === 'resultado' && document.querySelectorAll('.dre-cg-mes')[0].querySelectorAll('.dre-cg-barra').length === 2, 'gráfico do resultado: realizado e orçado');
  document.querySelector('[data-dre-toggle="r:alugueis"]').click(); await esperar(20);
  checar(document.querySelectorAll('.dre-tabela tr.dre-n2').length >= 1, 'grupo de receita abre nas classes');
  app.groupReceitas = [];

  document.querySelector('[data-dre-regime="caixa"]').click(); await esperar(20);
  checarIgual(app.state.dre.regime, 'caixa', 'troca para regime de caixa');
  const outro = document.querySelectorAll('[data-dre-pagador]')[1];
  if (outro) { outro.click(); await esperar(20); checarIgual(app.state.dre.pagadorId, outro.dataset.drePagador, 'troca de pagador'); }
  document.querySelector('[data-dash-aba="esteira"]').click(); await esperar(20);
  checar(!document.querySelector('.dre-tabela') && !!document.querySelector('.dash-alertas'), 'aba Esteira mostra o painel de sempre');

  console.log('### Configurações › Orçamento ###');
  app.state.view = 'cadastros'; app.state.configTab = 'orcamento'; render(); await esperar(20);
  checar(!!document.getElementById('btn-modelo-orcamento') && !!document.getElementById('btn-ler-orcamento'), 'administrador tem a aba Orçamento (modelo e importação)');

  checarSemErrosNaoTratados(erros, 'dre_tela');
  relatorioFinal('dre_tela');
}
