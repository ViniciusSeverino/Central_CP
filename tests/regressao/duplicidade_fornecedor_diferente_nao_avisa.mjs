// A checagem de duplicidade é por FORNECEDOR + número, não só o número:
// mesma NF em fornecedores diferentes não deve disparar aviso nenhum, e
// uma NF inédita também não.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros } = await bootApp(PERFIS.departamento);

function preencher(numero, fornecedorId) {
  document.getElementById('nf-emissao').value = '2026-07-01';
  document.getElementById('nf-vencimento').value = '2026-07-20';
  document.getElementById('nf-competencia').value = '2026-07';
  document.getElementById('nf-numero').value = numero;
  document.getElementById('nf-valor').value = '250';
  document.getElementById('nf-pagador').value = 'pag-1';
  document.getElementById('nf-pagador').dispatchEvent(new dom.window.Event('change'));
  document.getElementById('nf-fornecedor').value = fornecedorId;
  document.getElementById('nf-forma-pagamento').value = 'Boleto bancário';
  document.getElementById('nf-classificacao').value = 'Compras';
  document.getElementById('nf-centro-custo').value = 'cc-1';
  document.getElementById('nf-centro-custo').dispatchEvent(new dom.window.Event('change'));
  document.getElementById('nf-classe-conta').value = 'cl-1';
}

document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));
preencher('NF-1', 'forn-9'); // mesma NF da nota-1, mas outro fornecedor
let confirmChamado1 = false;
dom.window.confirm = () => { confirmChamado1 = true; return true; };
document.getElementById('btn-salvar-nota').click();
await new Promise(r => setTimeout(r, 150));
checar(!confirmChamado1, 'mesma NF em fornecedor DIFERENTE não dispara o aviso de duplicidade');

document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));
preencher('NF-9999-INEDITA', 'forn-0');
let confirmChamado2 = false;
dom.window.confirm = () => { confirmChamado2 = true; return true; };
document.getElementById('btn-salvar-nota').click();
await new Promise(r => setTimeout(r, 150));
checar(!confirmChamado2, 'NF inédita (mesmo fornecedor de outras notas) não dispara o aviso');

checarSemErrosNaoTratados(erros, 'duplicidade_fornecedor_diferente_nao_avisa');
relatorioFinal('duplicidade_fornecedor_diferente_nao_avisa');
