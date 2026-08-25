// Painel "Controle de acessos" (Configurações, só administrador -- ver
// migration 0048 e ui_configuracoes.js/renderControleDeAcessosTab). Cobre:
// visibilidade da aba, tabela com uma linha por usuário ativo e uma
// coluna por capacidade do catálogo, checkbox pré-marcado refletindo uma
// concessão já existente, e capacidades "ativa=false" desabilitadas com
// selo "em breve".
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.administrador);

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
checar(!!document.querySelector('[data-config-tab="acessos"]'), 'administrador vê a aba "Controle de acessos"');

document.querySelector('[data-config-tab="acessos"]').click();
await new Promise(r => setTimeout(r, 150));

// Nota: o rótulo/descrição de cada capacidade passa por escapeHtml() --
// não dá pra checar via body.textContent aqui porque o ambiente de teste
// (jsdom) não computa innerText em elemento desconectado (usado por
// escapeHtml pra escapar), sempre devolvendo vazio -- limitação só do
// jsdom, não reproduz em navegador de verdade. Por isso as checagens
// abaixo usam estrutura (contagem de colunas/checkboxes) em vez de texto.
checar(document.querySelectorAll('thead th').length === 8, 'cabeçalho tem 1 coluna de usuário + 7 colunas de capacidade (2 ativas + 5 "em breve")');
checar(document.querySelectorAll('[data-permissao-chave="gerenciar_cadastros"]').length > 0, 'coluna da capacidade ativa "gerenciar_cadastros" tem checkboxes');
checar(document.body.innerHTML.includes('(em breve)'), 'capacidade ainda não aplicada aparece com o selo "em breve" (texto estático, não passa por escapeHtml)');

const cbConcedido = document.querySelector('[data-permissao-usuario="u-dept-permissao-extra"][data-permissao-chave="gerenciar_cadastros"]');
checar(!!cbConcedido && cbConcedido.checked, 'checkbox de quem já tem "Gerenciar cadastros" concedido vem marcado');

const cbNaoConcedido = document.querySelector('[data-permissao-usuario="u-dept-1"][data-permissao-chave="gerenciar_cadastros"]');
checar(!!cbNaoConcedido && !cbNaoConcedido.checked, 'checkbox de quem NÃO tem a permissão vem desmarcado');

const cbEmBreve = document.querySelector('[data-permissao-usuario="u-dept-1"][data-permissao-chave="gerenciar_usuarios"]');
checar(!!cbEmBreve && cbEmBreve.disabled, 'checkbox de capacidade "em breve" vem desabilitado');

checarSemErrosNaoTratados(erros, 'controle_de_acessos_painel');
relatorioFinal('controle_de_acessos_painel');
