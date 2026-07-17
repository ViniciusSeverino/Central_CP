// Perfil "contas_a_pagar": vê as 4 filas de ação (lançar no Group, abrir
// chamado, validar CSC, confirmar pagamento) + pendências + todas, edita
// cadastros, e vê Arquivos (mas não Usuários/Delegações/Importar/Armazenamento).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.contasAPagar);
const { app } = await import('./app/src/js/state.js');

checar(app.state.view === 'dashboard', 'contas_a_pagar abre em "Visão geral" por padrão');

const nav = Array.from(document.querySelectorAll('.sb-nav [data-view]')).map(b => b.dataset.view);
['lancar_group', 'abrir_chamado', 'validar_csc', 'confirmar_pagamento', 'pendencias', 'todas', 'cadastros'].forEach(v => {
  checar(nav.includes(v), `contas_a_pagar vê a fila "${v}"`);
});
checar(!nav.includes('minhas'), 'contas_a_pagar não tem "minhas notas" (isso é do departamento)');
checar(nav.includes('rascunhos'), 'contas_a_pagar agora vê "Meus rascunhos" (também lança nota, só pro setor Financeiro)');
checar(nav.includes('dashboard'), 'contas_a_pagar vê a aba "Visão geral"');

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
const tabs = Array.from(document.querySelectorAll('[data-cad-tab]')).map(b => b.dataset.cadTab);
const configTabs = Array.from(document.querySelectorAll('[data-config-tab]')).map(b => b.dataset.configTab);
checar(configTabs.includes('arquivos'), 'contas_a_pagar vê a aba Arquivos (dentro de Configurações)');
checar(!configTabs.includes('armazenamento'), 'contas_a_pagar NÃO vê Armazenamento (só administrador)');
checar(!tabs.includes('usuarios'), 'contas_a_pagar não vê Usuários');
checar(!tabs.includes('delegacoes'), 'contas_a_pagar não vê Delegações');
checar(!tabs.includes('importar'), 'contas_a_pagar não vê Importar histórico');

document.querySelector('[data-cad-tab="fornecedores"]').click();
await new Promise(r => setTimeout(r, 50));
checar(!!document.getElementById('btn-novo-fornecedor'), 'contas_a_pagar vê botão de adicionar fornecedor (edita cadastros)');

// Caixinha: registra saída/reforço igual todo mundo, mas editar o teto
// (nome/valor) fica restrito a gerente_financeiro/administrador (ver
// 0026_caixinha_teto_so_super_usuario.sql) -- diferente do resto dos
// cadastros, que contas_a_pagar também edita.
document.querySelector('[data-view="caixinha"]').click();
await new Promise(r => setTimeout(r, 100));
checar(!!document.querySelector('[data-registrar-caixinha]'), 'contas_a_pagar vê os botões de registrar saída/reforço na caixinha');
checar(!document.querySelector('[data-editar-caixinha]'), 'contas_a_pagar NÃO vê "Editar teto" (restrito a gerente_financeiro/administrador)');
checar(!document.getElementById('btn-nova-caixinha'), 'contas_a_pagar NÃO vê "+ Nova caixinha"');

checarSemErrosNaoTratados(erros, 'permissoes_contas_a_pagar');
relatorioFinal('permissoes_contas_a_pagar');
