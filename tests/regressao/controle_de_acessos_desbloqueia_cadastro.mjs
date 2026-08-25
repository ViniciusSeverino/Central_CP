// Efeito de verdade da permissão extra "gerenciar_cadastros" (ver
// migration 0048 e podeOperarCadastro() em state.js): um departamento
// comum não vê botão de cadastrar fornecedor (ver
// permissoes_departamento.mjs), mas um departamento com essa permissão
// concedida passa a ver -- mesmo acesso que contas a pagar já tinha,
// sem precisar mudar de papel.
import { bootApp } from './lib/boot.mjs';
import { checar, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { document, erros } = await bootApp({ authUserId: 'auth-dept-permissao-extra', email: 'permissao-extra@central-cp.local' });

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
document.querySelector('[data-cad-tab="fornecedores"]').click();
await new Promise(r => setTimeout(r, 100));

checar(!!document.getElementById('btn-novo-fornecedor'), 'departamento com "gerenciar_cadastros" concedido vê o botão de adicionar fornecedor');

checarSemErrosNaoTratados(erros, 'controle_de_acessos_desbloqueia_cadastro');
relatorioFinal('controle_de_acessos_desbloqueia_cadastro');
