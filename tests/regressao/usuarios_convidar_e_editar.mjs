// Aba Usuários (só administrador): convidar um usuário novo e editar o
// papel de um já existente.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.administrador);
const qtdInicial = supabaseClientMod.__fixtures().usuarios.length;

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
document.querySelector('[data-cad-tab="usuarios"]').click();
await new Promise(r => setTimeout(r, 150));
checar(document.querySelectorAll('.data-tbl tbody tr').length === qtdInicial, `tabela de usuários mostra os ${qtdInicial} usuário(s) do fixture`);

document.getElementById('btn-convidar-usuario').click();
await new Promise(r => setTimeout(r, 100));
document.getElementById('cv-nome').value = 'Fulano Novo';
document.getElementById('cv-email').value = 'fulano@central-cp.local';
document.getElementById('cv-role').value = 'departamento';
document.getElementById('cv-role').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 30));
document.getElementById('cv-setor').value = 'Operações';
document.getElementById('confirmar-convidar').click();
await new Promise(r => setTimeout(r, 150));
checar(supabaseClientMod.__fixtures().usuarios.length === qtdInicial + 1, 'usuário novo foi criado via convite');
const novo = supabaseClientMod.__fixtures().usuarios.find(u => u.email === 'fulano@central-cp.local');
checar(!!novo && novo.role === 'departamento' && novo.ativo === true, 'usuário convidado nasce ativo, com o papel escolhido');

document.querySelector('[data-cad-tab="usuarios"]').click();
await new Promise(r => setTimeout(r, 150));
checar(document.querySelectorAll('.data-tbl tbody tr').length === qtdInicial + 1, 'tabela reflete o novo total depois de convidar');

const editCP = document.querySelector('[data-editar-usuario="u-cp-1"]');
editCP.click();
await new Promise(r => setTimeout(r, 100));
document.getElementById('ed-role').value = 'gerente_financeiro';
document.getElementById('confirmar-editar-usuario').click();
await new Promise(r => setTimeout(r, 150));
checar(supabaseClientMod.__fixtures().usuarios.find(u => u.id === 'u-cp-1').role === 'gerente_financeiro', 'editar o papel de um usuário existente persiste a mudança');

checarSemErrosNaoTratados(erros, 'usuarios_convidar_e_editar');
relatorioFinal('usuarios_convidar_e_editar');
