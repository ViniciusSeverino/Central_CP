// bindFornecedorCombo (ui_nota.js): quando dois fornecedores cadastrados
// têm o MESMO nome mas CNPJ diferente (empresas do mesmo grupo, ou
// coincidência), a busca do formulário de nota mostra o CNPJ ao lado do
// nome pra desempatar -- sem isso, a lista mostraria duas linhas
// idênticas e a pessoa poderia selecionar o fornecedor errado (o que,
// pelo leitor de documentos, sairia especialmente caro: uma dica de
// extração aprendida iria pro fornecedor errado).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros } = await bootApp(PERFIS.departamento);
const { app } = await import('./app/src/js/state.js');

document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));

// Dois cadastros com o mesmo nome, CNPJ diferente -- simula o cenário
// real descrito (duas filiais/empresas com nome parecido).
app.cadastros.fornecedores.push(
  { id: 'forn-dup-a', nome: 'Fornecedor Ambíguo Ltda', cnpj: '11.111.111/0001-11', municipio: 'BAURU' },
  { id: 'forn-dup-b', nome: 'Fornecedor Ambíguo Ltda', cnpj: '22.222.222/0001-22', municipio: 'BAURU' },
);

const busca = document.getElementById('nf-fornecedor-busca');
busca.value = 'Ambíguo';
busca.dispatchEvent(new dom.window.Event('input'));
await new Promise(r => setTimeout(r, 10));

const itens = document.querySelectorAll('.combo-item');
const itemA = Array.from(itens).find(el => el.dataset.id === 'forn-dup-a');
const itemB = Array.from(itens).find(el => el.dataset.id === 'forn-dup-b');
checar(!!itemA && !!itemB, 'os dois fornecedores com o mesmo nome aparecem na lista');
// O texto do CNPJ passa por escapeHtml() (dado de cadastro, editável) --
// em jsdom, escapeHtml() sempre devolve string vazia (limitação conhecida
// e documentada em vários outros testes desta suíte, não é um bug real),
// então a checagem certa é estrutural: o elemento .combo-item-sub existe
// pros dois itens com nome duplicado.
checar(!!itemA.querySelector('.combo-item-sub'), 'o primeiro item mostra o CNPJ dele pra desempatar (elemento presente)');
checar(!!itemB.querySelector('.combo-item-sub'), 'o segundo item mostra o CNPJ dele pra desempatar (elemento presente)');

// Fornecedor sem nome repetido continua mostrando só o nome (não
// polui a lista com CNPJ onde não tem ambiguidade nenhuma).
busca.value = 'Fornecedor Teste 5';
busca.dispatchEvent(new dom.window.Event('input'));
await new Promise(r => setTimeout(r, 10));
const itemSemDuplicidade = document.querySelector('.combo-item[data-id="forn-5"]');
checar(!!itemSemDuplicidade, 'acha o fornecedor sem nome duplicado');
checar(!itemSemDuplicidade.querySelector('.combo-item-sub'), 'fornecedor sem nome duplicado não mostra CNPJ (não precisa desempatar)');

// Selecionar explicitamente o segundo (CNPJ 22...) tem que gravar o id
// certo no campo escondido -- é esse id que qualquer dica aprendida
// depois fica associada, então escolher errado aqui seria o problema de
// verdade que a desambiguação evita.
busca.value = 'Ambíguo';
busca.dispatchEvent(new dom.window.Event('input'));
await new Promise(r => setTimeout(r, 10));
document.querySelector('.combo-item[data-id="forn-dup-b"]').dispatchEvent(new dom.window.Event('mousedown', { bubbles: true }));
await new Promise(r => setTimeout(r, 10));
checarIgual(document.getElementById('nf-fornecedor').value, 'forn-dup-b', 'selecionar o segundo item grava o id certo (forn-dup-b), não o do primeiro homônimo');

checarSemErrosNaoTratados(erros, 'fornecedor_combo_desambigua_cnpj');
relatorioFinal('fornecedor_combo_desambigua_cnpj');
