// Logout: some a sidebar/dados de perfil, volta pra tela de login, e o
// estado de navegação (view, modal, filtros) é resetado -- pra próxima
// pessoa que logar na mesma aba não herdar nada da sessão anterior.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.administrador);
const { app } = await import('./app/src/js/state.js');

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
checar(app.state.view === 'cadastros', 'estado de navegação avançou pra "cadastros" antes do logout');

document.getElementById('btn-logout').click();
await new Promise(r => setTimeout(r, 150));
checar(!document.querySelector('.sidebar'), 'sidebar some depois do logout');
checar(!!document.querySelector('.auth-wrap, form, input[type="password"]'), 'volta a mostrar alguma tela de login');
checar(app.state.view === 'minhas', 'app.state.view volta ao valor inicial ("minhas") depois do logout');
checar(app.state.modal === null, 'nenhum modal fica preso aberto depois do logout');

checarSemErrosNaoTratados(erros, 'auth_logout_reseta_estado');
relatorioFinal('auth_logout_reseta_estado');
