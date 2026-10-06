// Celular: o recebedor não lança nota completa -- o "+" dele abre
// "Anexar documento" (mesma regra da barra lateral do desktop).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros } = await bootApp({ ...PERFIS.departamentoRecebedor, mobile: true });
const { app } = await import('./app/src/js/state.js');
checar(!!document.querySelector('.m-fab#btn-novo-recebimento') && !document.getElementById('btn-nova-nota'), 'recebedor tem o "+" de anexar documento, não o de nota completa');
document.getElementById('btn-novo-recebimento').click();
await new Promise(r => setTimeout(r, 80));
checarIgual(app.state.modal, 'novo_recebimento', 'o "+" abre o anexo de documento');
checar(!document.querySelector('#btn-lote-nota'), 'recebedor não vê "Lançar em lote"');
checarSemErrosNaoTratados(erros, 'mobile_fab_recebedor');
relatorioFinal('mobile_fab_recebedor');
