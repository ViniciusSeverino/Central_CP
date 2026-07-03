// Departamento lança uma nota nova: busca de fornecedor (combobox),
// validação de formulário vazio (toast, sem crash) e o caso feliz (valor
// dentro da alçada do gerente -- vira "aprovado" automaticamente).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.departamento);

document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));

const buscaInput = document.getElementById('nf-fornecedor-busca');
buscaInput.value = 'Teste 1';
buscaInput.dispatchEvent(new dom.window.Event('input'));
await new Promise(r => setTimeout(r, 50));
const list = document.getElementById('nf-fornecedor-list');
checar(list.querySelectorAll('.combo-item').length > 0, 'busca de fornecedor retorna resultados pra "Teste 1"');
list.querySelector('.combo-item').dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
await new Promise(r => setTimeout(r, 50));
checar(document.getElementById('nf-fornecedor').value !== '', 'selecionar um resultado preenche o campo oculto nf-fornecedor');
checar(list.style.display === 'none', 'lista de resultados esconde depois de selecionar');

document.getElementById('btn-salvar-nota').click();
await new Promise(r => setTimeout(r, 100));
checar(!!document.querySelector('.toast'), 'salvar formulário vazio mostra um toast de validação (não crasha)');
checar(!document.getElementById('btn-salvar-nota').disabled, 'botão salvar volta a ficar habilitado depois da validação falhar');

document.getElementById('nf-emissao').value = '2026-06-01';
document.getElementById('nf-vencimento').value = '2026-07-01';
document.getElementById('nf-competencia').value = '2026-06';
document.getElementById('nf-numero').value = 'NF-999';
document.getElementById('nf-valor').value = '1000'; // dentro da alçada (limite = 5000)
document.getElementById('nf-pagador').value = 'pag-1';
document.getElementById('nf-pagador').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
document.getElementById('nf-fornecedor').value = 'forn-1';
document.getElementById('nf-forma-pagamento').value = 'Boleto bancário';
document.getElementById('nf-classificacao').value = 'Compras';
document.getElementById('nf-centro-custo').value = 'cc-1';
document.getElementById('nf-centro-custo').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
document.getElementById('nf-classe-conta').value = 'cl-1';
document.getElementById('btn-salvar-nota').click();
await new Promise(r => setTimeout(r, 150));

const nota = supabaseClientMod.__fixtures().notas.find(n => n.numero_nota === 'NF-999');
checar(!!nota, 'a nota nova foi criada');
checar(nota && nota.status === 'aprovado', 'valor dentro da alçada (R$1.000 < R$5.000) aprova automaticamente, sem passar por "lancado"');
checar(nota && nota.criado_por === PERFIS.departamento.usuarioId, 'a nota fica registrada em nome de quem lançou');

checarSemErrosNaoTratados(erros, 'ciclo_lancar_departamento');
relatorioFinal('ciclo_lancar_departamento');
