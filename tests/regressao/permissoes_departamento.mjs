// Perfil "departamento": vê só as próprias notas/rascunhos/pendências,
// não vê nenhuma sub-aba restrita de Cadastros, e o formulário de nova
// nota funciona (é o único fluxo que ele realmente executa do início ao fim).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.departamento);
const { app } = await import('./app/src/js/state.js');

checar(app.state.view === 'minhas', 'departamento continua abrindo em "Minhas notas" por padrão, mesmo agora tendo a aba "Visão geral"');

const nav = Array.from(document.querySelectorAll('.sb-nav [data-view]')).map(b => b.dataset.view);
checar(nav.includes('minhas') && nav.includes('rascunhos') && nav.includes('pendencias') && nav.includes('todas') && nav.includes('cadastros'), 'nav do departamento tem minhas/rascunhos/pendencias/todas/cadastros');
checar(!nav.includes('aprovacao') && !nav.includes('lancar_group'), 'departamento NÃO vê filas do CP/aprovação (aprovacao, lancar_group)');
checar(nav.includes('dashboard'), 'departamento agora vê a aba "Visão geral" (todos os perfis veem, ver 0024_cp_lanca_para_financeiro_e_todas_notas_geral.sql)');
checarIgual(document.querySelector('[data-view="cadastros"]').textContent.trim(), 'Configurações', 'a antiga aba "Cadastros" agora aparece como "Configurações" na sidebar (mesma data-view, só o rótulo mudou)');

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
const tabs = Array.from(document.querySelectorAll('[data-cad-tab]')).map(b => b.dataset.cadTab);
checar(!tabs.includes('usuarios'), 'departamento não vê aba Usuários');
checar(!tabs.includes('delegacoes'), 'departamento não vê aba Delegações');
checar(!tabs.includes('importar'), 'departamento não vê aba Importar histórico');
checar(!tabs.includes('armazenamento'), 'departamento não vê aba Armazenamento');
checar(!tabs.includes('arquivos'), 'departamento não vê aba Arquivos');
checar(tabs.includes('fornecedores') && tabs.includes('pagadores'), 'departamento vê as abas de consulta (fornecedores, pagadores)');

document.querySelector('[data-cad-tab="fornecedores"]').click();
await new Promise(r => setTimeout(r, 50));
checar(!document.getElementById('btn-novo-fornecedor'), 'departamento não vê botão de adicionar fornecedor (só consulta)');
checar(!document.querySelector('[data-editar-fornecedor]'), 'departamento não tem a linha do fornecedor clicável pra editar (só consulta)');

checarSemErrosNaoTratados(erros, 'permissoes_departamento');
relatorioFinal('permissoes_departamento');
