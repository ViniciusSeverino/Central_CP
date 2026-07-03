// Perfil "gerente_financeiro": acesso total (eh_super_usuario) -- vê e
// executa tudo do CP + aprovação + lançamento próprio, edita cadastros,
// vê Delegações (mas não Usuários/Importar/Armazenamento, exclusivos do administrador).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.gerenteFinanceiro);

const nav = Array.from(document.querySelectorAll('.sb-nav [data-view]')).map(b => b.dataset.view);
['rascunhos', 'aprovacao', 'lancar_group', 'abrir_chamado', 'validar_csc', 'confirmar_pagamento', 'pendencias', 'todas', 'cadastros'].forEach(v => {
  checar(nav.includes(v), `gerente_financeiro vê "${v}" (acesso total)`);
});
checar(!!document.getElementById('btn-nova-nota'), 'gerente_financeiro vê botão de nova nota (pode lançar do zero)');

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
const tabs = Array.from(document.querySelectorAll('[data-cad-tab]')).map(b => b.dataset.cadTab);
checar(tabs.includes('arquivos'), 'gerente_financeiro vê a aba Arquivos');
checar(tabs.includes('delegacoes'), 'gerente_financeiro vê Delegações (restritoA: super)');
checar(!tabs.includes('usuarios'), 'gerente_financeiro NÃO vê Usuários (exclusivo do administrador)');
checar(!tabs.includes('importar'), 'gerente_financeiro NÃO vê Importar histórico (exclusivo do administrador)');
checar(!tabs.includes('armazenamento'), 'gerente_financeiro NÃO vê Armazenamento (exclusivo do administrador)');

document.querySelector('[data-cad-tab="fornecedores"]').click();
await new Promise(r => setTimeout(r, 50));
checar(!!document.getElementById('btn-novo-fornecedor'), 'gerente_financeiro vê botão de adicionar fornecedor');

checarSemErrosNaoTratados(erros, 'permissoes_gerente_financeiro');
relatorioFinal('permissoes_gerente_financeiro');
