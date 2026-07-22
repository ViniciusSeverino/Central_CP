// Exclusão permanente de usuário (pedido do dono do produto, diferente de
// desativar): só administrador, nunca a própria conta, e o banco recusa
// (com um erro compreensível, não o texto cru do Postgres) se o usuário
// tiver notas associadas -- nesse caso a saída é desativar, não excluir.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros, supabaseClientMod } = await bootApp(PERFIS.administrador);

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
document.querySelector('[data-cad-tab="usuarios"]').click();
await new Promise(r => setTimeout(r, 150));

checar(!document.querySelector(`[data-excluir-usuario="${PERFIS.administrador.usuarioId}"]`), 'administrador logado não tem botão de se autoexcluir');

// u-inativo-1: fixture sem nenhuma nota associada -- exclusão precisa dar certo.
const btnExcluirInativo = document.querySelector('[data-excluir-usuario="u-inativo-1"]');
checar(!!btnExcluirInativo, 'usuário sem notas associadas mostra o botão "Excluir"');
btnExcluirInativo.click();
await new Promise(r => setTimeout(r, 150));
checar(!supabaseClientMod.__fixtures().usuarios.some(u => u.id === 'u-inativo-1'), 'usuário sem notas associadas foi excluído de vez');

// u-dept-1: fixture COM notas associadas (criado_por) -- exclusão precisa
// ser bloqueada com uma mensagem clara, não o código de erro do Postgres.
document.querySelector('[data-cad-tab="usuarios"]').click();
await new Promise(r => setTimeout(r, 150));
const btnExcluirComNotas = document.querySelector('[data-excluir-usuario="u-dept-1"]');
checar(!!btnExcluirComNotas, 'usuário com notas associadas também mostra o botão "Excluir" (a trava é do banco, não da UI)');
btnExcluirComNotas.click();
await new Promise(r => setTimeout(r, 150));
checar(supabaseClientMod.__fixtures().usuarios.some(u => u.id === 'u-dept-1'), 'usuário com notas associadas NÃO foi excluído -- continua na lista');
checar(!!document.querySelector('.toast'), 'mostra um toast explicando por que não deu pra excluir');

checarSemErrosNaoTratados(erros, 'usuarios_excluir_permanente');
relatorioFinal('usuarios_excluir_permanente');
