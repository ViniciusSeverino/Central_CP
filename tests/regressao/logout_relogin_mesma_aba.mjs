// "Sair" e entrar de novo na MESMA aba (sem recarregar a página): o
// logout montava um app.state parcial à mão, sem dashboardMes,
// gruposPagadorRecolhidos, filtros com o ano padrão etc. -- e o login só
// definia view, então quem cai na "Visão geral" (todo mundo menos
// departamento) quebrava em mes.split(undefined). Agora o logout recria o
// estado inteiro via estadoInicial() (state.js).
import { bootApp, PERFIS, esperar } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.administrador);
const { app } = await import('./app/src/js/state.js');
const chavesIniciais = Object.keys(app.state).sort();

document.getElementById('btn-logout').click();
await esperar(100);
checar(!!document.getElementById('login-email'), 'depois de "Sair" a tela de login aparece');
checarIgual(Object.keys(app.state).sort(), chavesIniciais, 'logout recria o estado com TODOS os campos do estado inicial');

document.getElementById('login-email').value = PERFIS.administrador.email;
document.getElementById('login-password').value = 'senha-qualquer';
document.getElementById('btn-do-login').click();
await esperar(200);

checarIgual(app.state.view, 'dashboard', 'relogar como administrador cai na Visão geral');
checar(document.body.textContent.includes('Valor parado na esteira'), 'a Visão geral renderiza depois de relogar na mesma aba');
checar(!!app.state.dashboardMes, 'dashboardMes volta preenchido depois do relogin');
checar(app.state.filters.dataDe.endsWith('-01-01'), 'filtro de "Todas as notas" volta com o ano corrente como padrão');

const navGroup = document.querySelector('[data-view="lancar_group"]');
if (navGroup) { navGroup.click(); await esperar(50); }
checar(!!navGroup, '"Lançar no Group" abre depois do relogin (usa gruposPagadorRecolhidos)');

checarSemErrosNaoTratados(erros, 'logout_relogin_mesma_aba');
relatorioFinal('logout_relogin_mesma_aba');
