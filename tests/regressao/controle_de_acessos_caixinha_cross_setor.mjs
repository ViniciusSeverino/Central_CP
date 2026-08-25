// Efeito de verdade da permissão extra "aprovar_caixinha" (ver migration
// 0048 e linhaMovimentacao() em ui_caixinha.js): quem ganha essa
// permissão passa a ver "Aprovar"/"Rejeitar" em qualquer movimentação
// pendente, mesmo fora do próprio setor -- diferente das capacidades
// "...de qualquer setor" (Fase 2, ainda não aplicadas), esta NÃO é
// restrita por setor nesta fase. u-dept-permissao-extra é do setor
// Marketing; mov-2 (caixinha-1) é do setor Financeiro, criada por
// u-cp-1 -- ainda assim deve ver o botão de aprovar.
import { bootApp } from './lib/boot.mjs';
import { checar, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { document, erros } = await bootApp({ authUserId: 'auth-dept-permissao-extra', email: 'permissao-extra@central-cp.local' });

document.querySelector('[data-view="caixinha"]').click();
await new Promise(r => setTimeout(r, 150));

const btnAprovar = document.querySelector('[data-aprovar-caixinha="mov-2"]');
checar(!!btnAprovar, 'departamento (Marketing) com "aprovar_caixinha" concedido vê "Aprovar" numa movimentação pendente de outro setor (Financeiro)');

const btnRejeitar = document.querySelector('[data-rejeitar-caixinha="mov-2"]');
checar(!!btnRejeitar, 'e também vê "Rejeitar" na mesma movimentação');

checarSemErrosNaoTratados(erros, 'controle_de_acessos_caixinha_cross_setor');
relatorioFinal('controle_de_acessos_caixinha_cross_setor');
