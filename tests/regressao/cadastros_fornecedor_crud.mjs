// contas_a_pagar cadastra um fornecedor novo (com conta bancária, PF/PJ,
// tipo de contratação e vigência de contrato) pelo modal dedicado, edita
// e depois remove -- fluxo completo do redesenho da aba Fornecedores
// (lista sempre visível, linha clicável, form fora do fluxo principal).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.contasAPagar);

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
document.querySelector('[data-cad-tab="fornecedores"]').click();
await new Promise(r => setTimeout(r, 50));

// 1) A lista já vem visível sem precisar digitar nada na busca (ao
// contrário do comportamento antigo, que exigia 2+ letras).
checar(document.querySelectorAll('.data-tbl tbody tr').length > 0, 'a lista de fornecedores já aparece sem precisar buscar nada');
checar(!document.getElementById('cadnew-nome'), 'o formulário de fornecedor NÃO fica inline na tela (só dentro do modal)');

// 2) Botão abre o modal de cadastro novo.
const btnNovo = document.getElementById('btn-novo-fornecedor');
checar(!!btnNovo, 'existe o botão "+ Adicionar fornecedor"');
btnNovo.click();
await new Promise(r => setTimeout(r, 50));
checar(!!document.getElementById('cadnew-nome'), 'clicar no botão abre o modal com o formulário');

document.getElementById('cadnew-nome').value = 'Fornecedor Novo Teste';
document.getElementById('cadnew-cnpj').value = '11.222.333/0001-44';

// PF/PJ é sugerido automaticamente pelo CPF/CNPJ ao sair do campo (14
// dígitos -> PJ), sem sobrescrever se a pessoa já tiver escolhido à mão.
document.getElementById('cadnew-cnpj').dispatchEvent(new dom.window.Event('blur'));
checarIgual(document.getElementById('cadnew-pessoa-tipo').value, 'PJ', 'CNPJ de 14 dígitos sugere automaticamente "PJ"');

document.getElementById('cadnew-tipo-contratacao-padrao').value = 'mensal';
document.getElementById('cadnew-vigencia-inicio').value = '2026-01-01';
document.getElementById('cadnew-vigencia-fim').value = '2026-12-31';
document.getElementById('cadnew-contrato-obs').value = 'Contrato de manutenção predial';

document.getElementById('cb-cod-banco').value = '341';
document.getElementById('cb-agencia').value = '0001';
document.getElementById('cb-conta').value = '99999-0';
document.getElementById('btn-conta-incluir').click();
await new Promise(r => setTimeout(r, 30));
checar(document.querySelectorAll('#fornecedor-contas-area .data-tbl tbody tr').length === 1, 'incluir conta bancária mostra 1 linha na mini-tabela do formulário');

const antesQtd = supabaseClientMod.__fixtures().fornecedores.length;
document.getElementById('confirmar-fornecedor').click();
await new Promise(r => setTimeout(r, 100));
checar(supabaseClientMod.__fixtures().fornecedores.length === antesQtd + 1, 'fornecedor novo foi persistido');
const criado = supabaseClientMod.__fixtures().fornecedores.find(f => f.nome === 'Fornecedor Novo Teste');
checar(!!criado, 'fornecedor criado tem o nome certo');
checarIgual(criado.pessoa_tipo, 'PJ', 'PF/PJ salvo certo');
checarIgual(criado.tipo_contratacao_padrao, 'mensal', 'tipo de contratação padrão salvo certo');
checarIgual(criado.contrato_vigencia_inicio, '2026-01-01', 'vigência início salva certa');
checarIgual(criado.contrato_vigencia_fim, '2026-12-31', 'vigência fim salva certa');
const contasSalvas = (supabaseClientMod.__fixtures().fornecedor_contas || []).filter(c => c.fornecedor_id === criado.id);
checar(contasSalvas.length === 1, 'a conta bancária incluída foi salva na tabela fornecedor_contas, vinculada ao fornecedor novo');

// 3) Busca funciona e a linha é clicável -- abre o modal de edição já
// preenchido com os dados salvos (inclusive a conta bancária).
document.getElementById('f-busca-fornecedor').value = 'Fornecedor Novo Teste';
document.getElementById('f-busca-fornecedor').dispatchEvent(new dom.window.Event('input'));
await new Promise(r => setTimeout(r, 50));
const linha = document.querySelector(`[data-editar-fornecedor="${criado.id}"]`);
checar(!!linha, 'busca encontra o fornecedor recém-criado e a linha é clicável');

linha.click();
await new Promise(r => setTimeout(r, 50));
checarIgual(document.getElementById('cadnew-tipo-contratacao-padrao').value, 'mensal', 'modal de edição vem preenchido com o tipo de contratação salvo');
checarIgual(document.getElementById('cadnew-vigencia-fim').value, '2026-12-31', 'modal de edição vem preenchido com a vigência salva');
checar(document.querySelectorAll('#fornecedor-contas-area .data-tbl tbody tr').length === 1, 'modal de edição já vem com a conta bancária existente na mini-tabela');

// O atributo value="..." de "nome" no modal de edição é montado com
// escapeHtml(), que zera texto no jsdom (mesma limitação documentada em
// arquivos_agrupamento_e_elegibilidade.mjs) -- reafirma o nome à mão pra
// não disparar "Informe o nome do fornecedor" à toa (num navegador de
// verdade o campo já viria preenchido certo).
document.getElementById('cadnew-nome').value = 'Fornecedor Novo Teste';
document.getElementById('cadnew-tipo-contratacao-padrao').value = 'sob_demanda';
document.getElementById('confirmar-fornecedor').click();
await new Promise(r => setTimeout(r, 100));
const atualizado = supabaseClientMod.__fixtures().fornecedores.find(f => f.id === criado.id);
checarIgual(atualizado.tipo_contratacao_padrao, 'sob_demanda', 'edição salvou a mudança de tipo de contratação');
const contasDepoisDeEditar = (supabaseClientMod.__fixtures().fornecedor_contas || []).filter(c => c.fornecedor_id === criado.id);
checarIgual(contasDepoisDeEditar.length, 1, 'conta bancária continua existindo depois de editar sem mexer nela (substituição não perde dado)');

// 4) Remover -- botão dentro da linha não deve também abrir o modal de
// edição (stopPropagation).
document.getElementById('f-busca-fornecedor').value = 'Fornecedor Novo Teste';
document.getElementById('f-busca-fornecedor').dispatchEvent(new dom.window.Event('input'));
await new Promise(r => setTimeout(r, 50));
const btnRemover = document.querySelector(`[data-cad-remove-fornecedor="${criado.id}"]`);
checar(!!btnRemover, 'botão de remover existe na linha (contas_a_pagar edita)');
dom.window.confirm = () => true;
btnRemover.click();
await new Promise(r => setTimeout(r, 100));
checar(!document.getElementById('cadnew-nome'), 'clicar em remover não também abre o modal de edição (stopPropagation funcionou)');
checar(!supabaseClientMod.__fixtures().fornecedores.some(f => f.id === criado.id), 'fornecedor foi removido de verdade');

checarSemErrosNaoTratados(erros, 'cadastros_fornecedor_crud');
relatorioFinal('cadastros_fornecedor_crud');
