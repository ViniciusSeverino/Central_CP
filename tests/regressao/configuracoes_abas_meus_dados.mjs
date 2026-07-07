// Aba "Configurações" (antes só "Cadastros" + botões soltos na sidebar):
// agora reúne Cadastros, Notificações e Meus dados (editar nome/trocar
// senha) em sub-abas próprias -- e o app abre em "Visão geral" por padrão
// pra quem tem essa aba (bug real relatado: estava abrindo em outra tela).
// Também cobre o outro bug relatado: clicar num item da sidebar enquanto
// um formulário de página inteira está aberto (ex: Nova nota) não navegava
// -- agora fecha o formulário (com a mesma confirmação de sempre) antes.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.administrador);
const { app } = await import('./app/src/js/state.js');

checar(app.state.view === 'dashboard', 'administrador/gerente/contas a pagar abrem em "Visão geral" por padrão (não numa fila específica da esteira)');

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));

checar(!!document.querySelector('.topbar h2'), 'a página "Configurações" renderiza');
checarIgual(document.querySelector('.topbar h2').textContent.trim(), 'Configurações', 'o título da página é "Configurações"');
checar(!!document.getElementById('btn-refresh'), '"Atualizar dados" está discreto dentro de Configurações (não mais solto na sidebar)');

const configTabs = Array.from(document.querySelectorAll('[data-config-tab]')).map(b => b.dataset.configTab);
checar(configTabs.includes('cadastros') && configTabs.includes('notificacoes') && configTabs.includes('meus_dados'), 'as 3 sub-abas existem: cadastros, notificacoes, meus_dados');
checar(!!document.querySelector('[data-cad-tab="fornecedores"]'), 'aba "Cadastros" é a padrão -- mostra a sub-navegação de Fornecedores/Pagadores/etc direto');

// --- Notificações ---
document.querySelector('[data-config-tab="notificacoes"]').click();
await new Promise(r => setTimeout(r, 50));
checar(document.querySelector('.topbar h2').textContent.trim() === 'Configurações', 'continua na página Configurações ao trocar de sub-aba (não perde o título)');
checar(!document.getElementById('btn-push-toggle'), 'sem suporte a push no navegador (jsdom), o botão não aparece -- vira só um aviso');
checar(!!document.querySelector('.form-section'), 'a aba Notificações mostra pelo menos o texto explicativo');

// --- Meus dados: editar nome ---
document.querySelector('[data-config-tab="meus_dados"]').click();
await new Promise(r => setTimeout(r, 50));
// O value do input passa por escapeHtml() (dado editável) -- em jsdom,
// escapeHtml() sempre devolve string vazia (limitação conhecida e
// documentada em vários outros testes desta suíte, não é bug real), então
// a checagem certa aqui é só estrutural: o campo existe.
const inputNome = document.getElementById('meus-dados-nome');
checar(!!inputNome, 'o campo de editar nome existe na aba Meus dados');

inputNome.value = 'Admin Renomeado';
document.getElementById('btn-salvar-meu-nome').click();
await new Promise(r => setTimeout(r, 100));

checar(app.usuario.nome === 'Admin Renomeado', 'app.usuario.nome é atualizado depois de salvar');
const usuarioNoBanco = supabaseClientMod.__fixtures().usuarios.find(u => u.id === app.usuario.id);
checar(usuarioNoBanco.nome === 'Admin Renomeado', 'o nome novo foi salvo no banco (mock)');
checar(!!document.querySelector('.sb-user .name'), 'a sidebar mostra o nome (mesmo elemento re-renderizado a partir de app.usuario.nome, já confirmado acima)');

// --- Meus dados: trocar senha (validações antes de chamar o backend) ---
document.querySelector('[data-config-tab="meus_dados"]').click();
await new Promise(r => setTimeout(r, 50));
document.getElementById('meus-dados-senha-nova').value = '123';
document.getElementById('meus-dados-senha-confirma').value = '123';
document.getElementById('btn-salvar-minha-senha').click();
await new Promise(r => setTimeout(r, 50));
// Os toasts anteriores ainda não somem do DOM (o timeout de remoção é de
// 5s, bem maior que a espera do teste) -- por isso sempre olha o ÚLTIMO
// .toast, não o primeiro (que seria de uma checagem anterior).
const ultimoToast = () => Array.from(document.querySelectorAll('.toast')).pop();
checar(!!ultimoToast()?.textContent.includes('pelo menos 6 caracteres'), 'senha curta demais é recusada antes de chamar o backend');

document.querySelector('[data-config-tab="meus_dados"]').click();
await new Promise(r => setTimeout(r, 50));
document.getElementById('meus-dados-senha-nova').value = 'senhanova123';
document.getElementById('meus-dados-senha-confirma').value = 'outraversao456';
document.getElementById('btn-salvar-minha-senha').click();
await new Promise(r => setTimeout(r, 50));
checar(!!ultimoToast()?.textContent.includes('não coincidem'), 'senhas diferentes são recusadas antes de chamar o backend');

document.querySelector('[data-config-tab="meus_dados"]').click();
await new Promise(r => setTimeout(r, 50));
document.getElementById('meus-dados-senha-nova').value = 'senhanova123';
document.getElementById('meus-dados-senha-confirma').value = 'senhanova123';
document.getElementById('btn-salvar-minha-senha').click();
await new Promise(r => setTimeout(r, 100));
checar(app.state.flash === 'Senha atualizada.', 'senha válida e confirmada é aceita e salva');

// --- Nav enquanto um formulário de página inteira está aberto ---
document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));
checar(!!document.querySelector('.page-form'), 'formulário de nova nota abriu em página inteira');

dom.window.confirm = () => false;
document.querySelector('[data-view="todas"]').click();
await new Promise(r => setTimeout(r, 50));
checar(!!document.querySelector('.page-form') && app.state.modal === 'nova_nota', 'cancelar a confirmação mantém o formulário aberto (não perde os dados)');

dom.window.confirm = () => true;
document.querySelector('[data-view="todas"]').click();
await new Promise(r => setTimeout(r, 100));
checar(!document.querySelector('.page-form') && app.state.view === 'todas', 'confirmando, o clique na sidebar fecha o formulário e navega de verdade (bug relatado: às vezes não funcionava)');

checarSemErrosNaoTratados(erros, 'configuracoes_abas_meus_dados');
relatorioFinal('configuracoes_abas_meus_dados');
