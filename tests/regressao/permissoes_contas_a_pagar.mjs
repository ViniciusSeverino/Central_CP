// Perfil "contas_a_pagar": vê as 4 filas de ação (lançar no Group, abrir
// chamado, validar CSC, confirmar pagamento) + pendências + todas, edita
// cadastros, e vê Arquivos (mas não Usuários/Delegações/Importar/Armazenamento).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.contasAPagar);

const nav = Array.from(document.querySelectorAll('.sb-nav [data-view]')).map(b => b.dataset.view);
['lancar_group', 'abrir_chamado', 'validar_csc', 'confirmar_pagamento', 'pendencias', 'todas', 'cadastros'].forEach(v => {
  checar(nav.includes(v), `contas_a_pagar vê a fila "${v}"`);
});
checar(!nav.includes('minhas') && !nav.includes('rascunhos'), 'contas_a_pagar não tem "minhas notas"/"rascunhos" (isso é do departamento)');

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
const tabs = Array.from(document.querySelectorAll('[data-cad-tab]')).map(b => b.dataset.cadTab);
checar(tabs.includes('arquivos'), 'contas_a_pagar vê a aba Arquivos');
checar(!tabs.includes('armazenamento'), 'contas_a_pagar NÃO vê Armazenamento (só administrador)');
checar(!tabs.includes('usuarios'), 'contas_a_pagar não vê Usuários');
checar(!tabs.includes('delegacoes'), 'contas_a_pagar não vê Delegações');
checar(!tabs.includes('importar'), 'contas_a_pagar não vê Importar histórico');

document.querySelector('[data-cad-tab="fornecedores"]').click();
await new Promise(r => setTimeout(r, 50));
checar(!!document.getElementById('btn-add-cadastro'), 'contas_a_pagar vê botão de adicionar fornecedor (edita cadastros)');

checarSemErrosNaoTratados(erros, 'permissoes_contas_a_pagar');
relatorioFinal('permissoes_contas_a_pagar');
