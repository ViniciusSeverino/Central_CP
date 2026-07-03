// contas_a_pagar cadastra um fornecedor novo (com conta bancária) e
// depois remove -- fluxo de criação/edição/remoção de cadastro simples.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.contasAPagar);

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
document.querySelector('[data-cad-tab="fornecedores"]').click();
await new Promise(r => setTimeout(r, 50));

document.getElementById('cadnew-nome').value = 'Fornecedor Novo Teste';
document.getElementById('cadnew-cnpj').value = '11.222.333/0001-44';
document.getElementById('cb-cod-banco').value = '341';
document.getElementById('cb-agencia').value = '0001';
document.getElementById('cb-conta').value = '99999-0';
document.getElementById('btn-conta-incluir').click();
await new Promise(r => setTimeout(r, 30));
checar(document.querySelectorAll('#fornecedor-contas-area .data-tbl tbody tr').length === 1, 'incluir conta bancária mostra 1 linha na mini-tabela do formulário');

const antesQtd = supabaseClientMod.__fixtures().fornecedores.length;
document.getElementById('btn-add-cadastro').click();
await new Promise(r => setTimeout(r, 100));
checar(supabaseClientMod.__fixtures().fornecedores.length === antesQtd + 1, 'fornecedor novo foi persistido');
const criado = supabaseClientMod.__fixtures().fornecedores.find(f => f.nome === 'Fornecedor Novo Teste');
checar(!!criado, 'fornecedor criado tem o nome certo');
const contasSalvas = (supabaseClientMod.__fixtures().fornecedor_contas || []).filter(c => c.fornecedor_id === criado.id);
checar(contasSalvas.length === 1, 'a conta bancária incluída foi salva na tabela fornecedor_contas, vinculada ao fornecedor novo');

document.getElementById('f-busca-fornecedor').value = 'Fornecedor Novo Teste';
document.getElementById('f-busca-fornecedor').dispatchEvent(new dom.window.Event('input'));
await new Promise(r => setTimeout(r, 50));
const btnRemover = document.querySelector(`[data-cad-remove="${criado.id}"]`);
checar(!!btnRemover, 'busca encontra o fornecedor recém-criado e mostra o botão de remover (contas_a_pagar edita)');

checarSemErrosNaoTratados(erros, 'cadastros_fornecedor_crud');
relatorioFinal('cadastros_fornecedor_crud');
