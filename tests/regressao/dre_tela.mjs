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

  console.log('### Abas e padrões ###');
  const aba = async (nome) => { app.state.dashboardAba = nome; render(); await esperar(20); };
  checar(!!document.querySelector('[data-dash-aba="resultado"].active'), 'administrador abre a Visão geral na aba Resultado');
  checarIgual(['resultado', 'dre', 'conciliacao', 'esteira'].every(k => document.querySelector(`[data-dash-aba="${k}"]`)), true, 'abas Resultado | DRE | Conciliação | Esteira');
  checarIgual(app.state.dre.regime, 'caixa', 'regime de caixa por padrão');
  const botoesPag = Array.from(document.querySelectorAll('[data-dre-pagador]'));
  checarIgual(botoesPag.length, app.cadastros.pagadores.length, 'um botão por pagador');
  const siglaDe = (id) => (app.cadastros.pagadores.find(p => p.id === id) || {}).sigla;
  checarIgual(botoesPag.map(b => siglaDe(b.dataset.drePagador)), ['CONS', 'COND', 'FPP'], 'Consórcio antes do Condomínio');
  checarIgual(siglaDe(app.state.dre.pagadorId), 'CONS', 'Consórcio selecionado por padrão');
  checar(!document.querySelector('.dre-tabela') && !!document.querySelector('.dre-cg'), 'aba Resultado: painel e gráfico, sem a tabela');
  checarIgual(document.querySelectorAll('[data-dre-regime]').length, 2, 'só dois regimes: caixa e competência');

  // Os dados do fixture são do Condomínio, por competência.
  document.querySelector(`[data-dre-pagador="${app.cadastros.pagadores.find(p => p.sigla === 'COND').id}"]`).click(); await esperar(20);
  document.querySelector('[data-dre-regime="competencia"]').click(); await esperar(20);
  await aba('dre');
  checarIgual(siglaDe(app.state.dre.pagadorId), 'COND', 'trocar de aba mantém o pagador');
  checarIgual(app.state.dre.regime, 'competencia', 'e o regime');
  checar(!document.querySelector('.dre-cg') && !!document.querySelector('.dre-tabela'), 'aba DRE: a tabela, sem o painel');

  console.log('### Tabela (aba DRE) ###');
  checarIgual(document.querySelectorAll('.dre-tabela thead th.dre-mes').length, 12, 'uma coluna por mês');
  checar(document.querySelector('.dre-tabela thead').textContent.includes('Orçado 2026') && document.querySelector('.dre-tabela thead').textContent.includes('Desvio'), 'totais do ano: orçado, realizado e desvio');
  checar(!document.querySelector('.dre-tabela tfoot'), 'sem linha fixa no rodapé');
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
  app.state.modal = null; app.state.dre.detalhe = null; app.state.dre.abertos = new Set(); render(); await esperar(20);

  console.log('### Orçado ###');
  // Orçado pela CLASSE das notas do fixture (cl-1), bem abaixo do realizado de junho.
  app.orcamento = [{ pagador_id: app.state.dre.pagadorId, ano: 2026, mes: 6, codigo_classificacao_id: null, classe_conta_id: 'cl-1', valor: 100 }];
  render(); await esperar(20);
  checar(!!document.querySelector('.dre-regua.estourou'), 'com orçado menor que o realizado, a régua do mês aparece em alerta');
  const exibir = () => document.getElementById('dre-exibir');
  exibir().value = 'orcado'; exibir().dispatchEvent(new dom.window.Event('change')); await esperar(20);
  checarIgual(app.state.dre.exibir, 'orcado', 'seletor Exibir troca para só orçado');
  checar(!document.querySelector('.dre-regua'), 'em "só orçado" não tem régua');
  exibir().value = 'realizado_orcado'; exibir().dispatchEvent(new dom.window.Event('change')); await esperar(20);

  app.state.dre.mesFoco = 6; await aba('resultado');
  const desvios = document.querySelectorAll('.dre-foco-lista')[1];
  checar(desvios && desvios.querySelector('li .dre-acima') && desvios.textContent.includes('+'), 'mês em foco: "Maiores desvios vs orçado" lista a conta acima do orçado');
  checar(!!document.querySelector('.dre-leitura li.tom-alerta'), 'leitura do mês traz um alerta (despesa acima do orçado)');
  checarIgual(document.querySelectorAll('.dre-cg-mes')[0].querySelectorAll('.dre-cg-barra').length, 2, 'gráfico com orçado: realizado e orçado');
  checar(!!document.querySelector('.dre-cg-mes.foco .dre-cg-valor'), 'mês em foco mostra o valor sobre a barra');
  checarIgual(document.querySelectorAll('.dre-cg-mes').length, 12, 'gráfico de colunas: um grupo por mês');
  checar(!document.querySelector('[data-dre-serie]'), 'sem receitas, o gráfico é só de despesas');
  document.querySelectorAll('.dre-cg-mes')[4].click(); await esperar(20);
  checarIgual(app.state.dre.mesFoco, 5, 'clicar no mês do gráfico troca o mês em foco');

  console.log('### Atalho Resultado -> DRE ###');
  app.state.dre.mesFoco = 6; render(); await esperar(20);
  const ir = document.querySelector('[data-dre-ir]');
  checar(!!ir, 'contas que mais mudaram são clicáveis');
  ir.click(); await esperar(20);
  checarIgual(app.state.dashboardAba, 'dre', 'clicar leva à aba DRE');
  checar(document.querySelectorAll('.dre-tabela tr.dre-n2, .dre-tabela tr.dre-n3').length > 0, 'com a linha da conta aberta');
  app.orcamento = []; app.state.dre.abertos = new Set();

  console.log('### Receitas ###');
  app.groupReceitas = [
    { id_group: 1, pagador_id: app.state.dre.pagadorId, classe: 'ALUGUEL MÍNIMO', mes_ref: '06/2026', situacao: 'Baixada', recebimento: '2026-06-10', faturado: 9000, valor_liquido: 9000, vencimento: '2026-06-05' },
    { id_group: 2, pagador_id: app.state.dre.pagadorId, classe: 'ENCARGO COMUM', mes_ref: '06/2026', situacao: 'Emitida', faturado: 1000, valor_liquido: 0, vencimento: '2026-06-05' },
    { id_group: 3, pagador_id: app.state.dre.pagadorId, classe: 'ALUGUEL MÍNIMO', mes_ref: '06/2025', situacao: 'Baixada', recebimento: '2025-06-10', faturado: 7000, valor_liquido: 7000, vencimento: '2025-06-05' },
  ];
  await aba('dre');
  checar(!!document.querySelector('[data-dre-toggle="r:alugueis"]') && !!document.querySelector('.dre-resultado'), 'tabela com o bloco de receitas e a linha de resultado');
  document.querySelector('[data-dre-toggle="r:alugueis"]').click(); await esperar(20);
  checar(document.querySelectorAll('.dre-tabela tr.dre-n2').length >= 1, 'grupo de receita abre nas classes');
  app.state.dre.mesFoco = 6; await aba('resultado');
  checarIgual(document.querySelectorAll('[data-dre-serie]').length, 3, 'com receitas: gráfico de despesas, receitas ou resultado');
  checarIgual(document.querySelectorAll('.dre-foco-card').length, 3, 'mês em foco: receita, despesa e resultado');
  checar(document.querySelector('.dre-kpis').textContent.includes('Inadimplência'), 'painel mostra a inadimplência');
  document.querySelector('[data-dre-serie="receitas"]').click(); await esperar(20);
  checar(!!document.querySelector('.dre-cg-barra.s-ant') && !document.querySelector('.dre-cg-barra.s-orc'), 'sem orçado de receitas, a comparação é com o ano anterior');
  checar(document.querySelectorAll('.dre-foco-lista')[1].querySelector('li'), 'sem orçado, a segunda lista compara com o mesmo mês do ano anterior');
  app.groupReceitas = [];

  document.querySelector('[data-dre-regime="caixa"]').click(); await esperar(20);
  checarIgual(app.state.dre.regime, 'caixa', 'volta para caixa');
  document.querySelector('[data-dash-aba="esteira"]').click(); await esperar(20);
  checar(!document.querySelector('.dre-tabela') && !!document.querySelector('.dash-alertas'), 'aba Esteira mostra o painel de sempre');

  console.log('### Configurações › Orçamento ###');
  app.state.view = 'cadastros'; app.state.configTab = 'orcamento'; render(); await esperar(20);
  checar(!!document.getElementById('btn-modelo-orcamento') && !!document.getElementById('btn-ler-orcamento'), 'administrador tem a aba Orçamento (modelo e importação)');

  checarSemErrosNaoTratados(erros, 'dre_tela');
  relatorioFinal('dre_tela');
}
