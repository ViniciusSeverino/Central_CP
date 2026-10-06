// Celular: contas a pagar também lança nota (como na barra lateral do
// desktop), então também ganha o botão "+" (ver ui_mobile.js).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros } = await bootApp({ ...PERFIS.contasAPagar, mobile: true });
checar(!!document.querySelector('.m-fab#btn-nova-nota'), 'contas a pagar tem o botão "+" de nova nota no celular');
document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 80));
checar(!!document.querySelector('.page-form'), 'o "+" abre o formulário de nota');
checar(!document.querySelector('.m-drawer #btn-lote-nota'), 'lote continua só pra departamento/gerente/administrador (igual ao desktop)');
checarSemErrosNaoTratados(erros, 'mobile_fab_contas_a_pagar');
relatorioFinal('mobile_fab_contas_a_pagar');
