// Departamentos (setores) cadastráveis pelo administrador (pedido do dono
// do produto, ponto 2), com pré-preenchimento configurável (pagador
// padrão, ver migration 0034 + pagadorPadraoParaSetor em state.js) --
// deixou de ser uma lista fixa (SETORES vinha de config.js). Cobre: a aba
// nova em Cadastros, criar um departamento com pagador padrão, e o
// departamento novo aparecendo de verdade em SETORES (combo de "Setor" no
// formulário de nota + pré-preenchimento de pagador), sem precisar
// recarregar a página inteira.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros, supabaseClientMod } = await bootApp(PERFIS.administrador);
// Namespace do módulo, não uma desestruturação -- SETORES é reatribuído
// depois (atualizarSetoresDisponiveis, ver app.js) quando o departamento
// novo é criado; `stateMod.SETORES` sempre lê o valor atual, uma
// desestruturação (`const { SETORES } = ...`) travaria no valor de agora.
const stateMod = await import('./app/src/js/state.js');

checarIgual([...stateMod.SETORES].sort(), ['Financeiro', 'Marketing', 'Operações'].sort(), 'SETORES começa com os 3 departamentos já cadastrados (fixture)');

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
document.querySelector('[data-cad-tab="setores"]').click();
await new Promise(r => setTimeout(r, 150));

checar(document.body.textContent.includes('Departamentos'), 'aba "Departamentos" existe e está selecionada');
checar(!!document.getElementById('cadnew-nome'), 'formulário de novo departamento tem o campo nome');
checar(!!document.getElementById('cadnew-pagador_padrao_id'), 'formulário de novo departamento tem o campo de pagador padrão');

document.getElementById('cadnew-nome').value = 'TI';
document.getElementById('cadnew-pagador_padrao_id').value = 'pag-1'; // Condomínio
document.getElementById('btn-add-cadastro').click();
await new Promise(r => setTimeout(r, 150));

const novoSetor = supabaseClientMod.__fixtures().setores.find(s => s.nome === 'TI');
checar(!!novoSetor, 'departamento "TI" foi criado');
checarIgual(novoSetor.pagador_padrao_id, 'pag-1', 'departamento novo guarda o pagador padrão escolhido');
checarIgual(supabaseClientMod.__fixtures().setores.length, 4, 'departamento novo aparece na lista (4 setores no total agora)');

checar(stateMod.SETORES.includes('TI'), 'SETORES (usado nos combos de "Setor" em todo o app) já reflete o departamento novo, sem precisar recarregar a página');
checarIgual(stateMod.pagadorPadraoParaSetor('TI'), 'pag-1', 'pré-preenchimento de pagador pro departamento novo funciona (mesma função usada no formulário de recebimento)');

// Combo de "Setor" no formulário de nota (administrador não tem setor
// fixo) já mostra o departamento novo.
document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));
const optSetor = Array.from(document.getElementById('nf-setor').options).map(o => o.value);
checar(optSetor.includes('TI'), 'combo de "Setor" no formulário de nota já mostra o departamento novo');

checarSemErrosNaoTratados(erros, 'setores_departamentos');
relatorioFinal('setores_departamentos');
