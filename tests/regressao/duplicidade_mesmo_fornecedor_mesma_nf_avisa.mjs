// Aviso (não bloqueio) de possível NF duplicada: mesmo fornecedor + mesmo
// número de NF já lançado antes -- usuário pode cancelar (não salva) ou
// confirmar que não é duplicata de verdade (salva normalmente).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.departamento);

function preencherFormularioBase() {
  document.getElementById('nf-emissao').value = '2026-07-01';
  document.getElementById('nf-vencimento').value = '2026-07-20';
  document.getElementById('nf-competencia').value = '2026-07';
  document.getElementById('nf-numero').value = 'NF-1'; // igual à nota-1
  document.getElementById('nf-valor').value = '250';
  document.getElementById('nf-pagador').value = 'pag-1';
  document.getElementById('nf-pagador').dispatchEvent(new dom.window.Event('change'));
  document.getElementById('nf-fornecedor').value = 'forn-0'; // igual à nota-1
  document.getElementById('nf-forma-pagamento').value = 'Boleto bancário';
  document.getElementById('nf-classificacao').value = 'Compras';
  document.getElementById('nf-centro-custo').value = 'cc-1';
  document.getElementById('nf-centro-custo').dispatchEvent(new dom.window.Event('change'));
  document.getElementById('nf-classe-conta').value = 'cl-1';
}

document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));
preencherFormularioBase();
let confirmChamado = false;
dom.window.confirm = (msg) => { confirmChamado = true; return false; }; // usuário CANCELA
const antesDoCancelar = supabaseClientMod.__fixtures().notas.length;
document.getElementById('btn-salvar-nota').click();
await new Promise(r => setTimeout(r, 150));
checar(confirmChamado, 'mesmo fornecedor + mesma NF dispara o confirm() de aviso');
checar(supabaseClientMod.__fixtures().notas.length === antesDoCancelar, 'cancelar no confirm NÃO salva a nota');

document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));
preencherFormularioBase();
dom.window.confirm = () => true; // usuário CONFIRMA que não é duplicata
const antesDoConfirmar = supabaseClientMod.__fixtures().notas.length;
document.getElementById('btn-salvar-nota').click();
await new Promise(r => setTimeout(r, 150));
checar(supabaseClientMod.__fixtures().notas.length === antesDoConfirmar + 1, 'confirmar no aviso salva a nota normalmente (o aviso não bloqueia)');

checarSemErrosNaoTratados(erros, 'duplicidade_mesmo_fornecedor_mesma_nf_avisa');
relatorioFinal('duplicidade_mesmo_fornecedor_mesma_nf_avisa');
