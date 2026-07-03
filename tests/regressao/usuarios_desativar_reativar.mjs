// Desativar/reativar usuário: some/volta o botão certo, e o próprio
// administrador logado não pode se autodesativar (sem botão de
// desativar na própria linha).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros, supabaseClientMod } = await bootApp(PERFIS.administrador);

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
document.querySelector('[data-cad-tab="usuarios"]').click();
await new Promise(r => setTimeout(r, 150));

checar(!document.querySelector(`[data-desativar-usuario="${PERFIS.administrador.usuarioId}"]`), 'administrador logado não tem botão de se autodesativar');

const btnDesativar = document.querySelector('[data-desativar-usuario="u-dept-1"]');
checar(!!btnDesativar, 'usuário ativo mostra o botão "Desativar"');
btnDesativar.click();
await new Promise(r => setTimeout(r, 150));
checar(supabaseClientMod.__fixtures().usuarios.find(u => u.id === 'u-dept-1').ativo === false, 'desativar realmente marca ativo=false');

document.querySelector('[data-cad-tab="usuarios"]').click();
await new Promise(r => setTimeout(r, 150));
const btnReativar = document.querySelector('[data-reativar-usuario="u-dept-1"]');
checar(!!btnReativar, 'usuário inativo agora mostra o botão "Reativar" no lugar de "Desativar"');
btnReativar.click();
await new Promise(r => setTimeout(r, 150));
checar(supabaseClientMod.__fixtures().usuarios.find(u => u.id === 'u-dept-1').ativo === true, 'reativar volta ativo=true');

checarSemErrosNaoTratados(erros, 'usuarios_desativar_reativar');
relatorioFinal('usuarios_desativar_reativar');
