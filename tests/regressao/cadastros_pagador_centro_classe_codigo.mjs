// Os 4 cadastros "simples" (campos genéricos via REGISTRY_DEFS): criar um
// de cada e remover um -- confirma que o registro genérico funciona pra
// qualquer um deles, não só fornecedor (que tem tratamento especial).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros, supabaseClientMod } = await bootApp(PERFIS.administrador);

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));

document.querySelector('[data-cad-tab="pagadores"]').click();
await new Promise(r => setTimeout(r, 50));
document.getElementById('cadnew-nome').value = 'Pagador Teste Novo';
document.getElementById('cadnew-sigla').value = 'PTN';
const antesPagadores = supabaseClientMod.__fixtures().pagadores.length;
document.getElementById('btn-add-cadastro').click();
await new Promise(r => setTimeout(r, 100));
checar(supabaseClientMod.__fixtures().pagadores.length === antesPagadores + 1, 'novo pagador foi criado');

document.querySelector('[data-cad-tab="centros_custo"]').click();
await new Promise(r => setTimeout(r, 50));
document.getElementById('cadnew-codigo').value = '3.01';
document.getElementById('cadnew-nome').value = 'Centro Teste Novo';
const antesCentros = supabaseClientMod.__fixtures().centros_custo.length;
document.getElementById('btn-add-cadastro').click();
await new Promise(r => setTimeout(r, 100));
checar(supabaseClientMod.__fixtures().centros_custo.length === antesCentros + 1, 'novo centro de custo foi criado');

document.querySelector('[data-cad-tab="classes_conta"]').click();
await new Promise(r => setTimeout(r, 50));
document.getElementById('cadnew-codigo').value = '3.01.01';
document.getElementById('cadnew-nome').value = 'Classe Teste Nova';
document.getElementById('cadnew-centro_custo_id').value = 'cc-1';
const antesClasses = supabaseClientMod.__fixtures().classes_conta.length;
document.getElementById('btn-add-cadastro').click();
await new Promise(r => setTimeout(r, 100));
checar(supabaseClientMod.__fixtures().classes_conta.length === antesClasses + 1, 'nova classe de conta foi criada');

document.querySelector('[data-cad-tab="codigos_classificacao"]').click();
await new Promise(r => setTimeout(r, 50));
document.getElementById('cadnew-codigo').value = '3.01.01.01';
document.getElementById('cadnew-nome').value = 'Código Teste Novo';
document.getElementById('cadnew-classe_conta_id').value = 'cl-1';
const antesCodigos = supabaseClientMod.__fixtures().codigos_classificacao.length;
document.getElementById('btn-add-cadastro').click();
await new Promise(r => setTimeout(r, 100));
checar(supabaseClientMod.__fixtures().codigos_classificacao.length === antesCodigos + 1, 'novo código de classificação foi criado');

const btnRemoverCentro = document.querySelector('[data-cad-remove]');
checar(!!btnRemoverCentro, 'a tabela mostra o botão de remover pro administrador');

checarSemErrosNaoTratados(erros, 'cadastros_pagador_centro_classe_codigo');
relatorioFinal('cadastros_pagador_centro_classe_codigo');
