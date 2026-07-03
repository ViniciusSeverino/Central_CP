// Aviso (não bloqueio) de contrato vencido no fornecedor -- regra de
// conferência do CSC ("devolver NF se contrato vencido", documento WE9).
// Mesmo padrão de UX já usado pro aviso de NF duplicada: confirm() no
// momento de salvar, cancelável, mais um selo na tela de detalhe.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.departamento);
const { contratoVencido } = await import('./app/src/js/state.js');

// 1) Função pura: só considera vencido quando tem data de fim cadastrada
// E ela já passou da data de referência.
checarIgual(contratoVencido(null, '2026-07-01'), false, 'sem fornecedor, não há o que vencer');
checarIgual(contratoVencido({ contrato_vigencia_fim: null }, '2026-07-01'), false, 'sem vigência cadastrada, contrato não vence');
checarIgual(contratoVencido({ contrato_vigencia_fim: '2026-06-01' }, '2026-07-01'), true, 'vigência no passado em relação à referência -> vencido');
checarIgual(contratoVencido({ contrato_vigencia_fim: '2026-08-01' }, '2026-07-01'), false, 'vigência no futuro em relação à referência -> ainda válido');
checarIgual(contratoVencido({ contrato_vigencia_fim: '2026-07-01' }, '2026-07-01'), false, 'vigência que termina exatamente na data de referência ainda não venceu (só no dia seguinte)');

// 2) Fim a fim: fornecedor forn-0 (usado nas notas fixture) ganha um
// contrato vencido -- lançar uma nota de emissão posterior à vigência
// dispara o aviso; cancelar não salva, confirmar salva normalmente.
const forn0 = supabaseClientMod.__fixtures().fornecedores.find(f => f.id === 'forn-0');
forn0.contrato_vigencia_inicio = '2025-01-01';
forn0.contrato_vigencia_fim = '2026-06-01';
// app.cadastros já foi carregado no boot (uma cópia, não a mesma
// referência do fixture) -- precisa recarregar pra essa mutação aparecer.
document.getElementById('btn-refresh').click();
await new Promise(r => setTimeout(r, 150));

function preencherFormularioBase(numero) {
  document.getElementById('nf-emissao').value = '2026-07-01'; // depois da vigência (01/06) -> vencido
  document.getElementById('nf-competencia').value = '2026-07';
  document.getElementById('nf-numero').value = numero;
  document.getElementById('nf-valor').value = '250';
  document.getElementById('nf-pagador').value = 'pag-1';
  document.getElementById('nf-pagador').dispatchEvent(new dom.window.Event('change'));
  document.getElementById('nf-fornecedor').value = 'forn-0';
  document.getElementById('nf-forma-pagamento').value = 'Boleto bancário';
  document.getElementById('nf-classificacao').value = 'Compras';
  document.getElementById('nf-centro-custo').value = 'cc-1';
  document.getElementById('nf-centro-custo').dispatchEvent(new dom.window.Event('change'));
  document.getElementById('nf-classe-conta').value = 'cl-1';
}

document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));
preencherFormularioBase('NF-CONTRATO-1');
let mensagemConfirm = '';
dom.window.confirm = (msg) => { mensagemConfirm = msg; return false; }; // usuário CANCELA
const antesDoCancelar = supabaseClientMod.__fixtures().notas.length;
document.getElementById('btn-salvar-nota').click();
await new Promise(r => setTimeout(r, 150));
checar(mensagemConfirm.includes('vencido'), 'contrato vencido dispara o confirm() de aviso, mencionando "vencido"');
checar(mensagemConfirm.includes('01/06/2026'), 'a mensagem cita a data real de fim de vigência');
checarIgual(supabaseClientMod.__fixtures().notas.length, antesDoCancelar, 'cancelar no confirm NÃO salva a nota');

document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));
preencherFormularioBase('NF-CONTRATO-2');
dom.window.confirm = () => true; // usuário CONFIRMA que quer lançar mesmo assim
document.getElementById('btn-salvar-nota').click();
await new Promise(r => setTimeout(r, 150));
const notaCriada = supabaseClientMod.__fixtures().notas.find(n => n.numero_nota === 'NF-CONTRATO-2');
checar(!!notaCriada, 'confirmar no aviso salva a nota normalmente (o aviso não bloqueia)');

// 3) Detalhe da nota mostra o selo de contrato vencido.
document.querySelector(`.nota-card[data-open="${notaCriada.id}"]`).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 100));
checar(document.body.textContent.includes('contrato vencido em 01/06/2026'), 'detalhe da nota mostra o selo de contrato vencido com a data certa');

// 4) Fornecedor sem vigência vencida não dispara nada (não regride pro
// caso comum, mais frequente).
document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));
document.getElementById('nf-emissao').value = '2026-07-01';
document.getElementById('nf-competencia').value = '2026-07';
document.getElementById('nf-numero').value = 'NF-SEM-CONTRATO';
document.getElementById('nf-valor').value = '100';
document.getElementById('nf-pagador').value = 'pag-1';
document.getElementById('nf-pagador').dispatchEvent(new dom.window.Event('change'));
document.getElementById('nf-fornecedor').value = 'forn-1'; // sem vigência cadastrada
document.getElementById('nf-forma-pagamento').value = 'Boleto bancário';
document.getElementById('nf-classificacao').value = 'Compras';
document.getElementById('nf-centro-custo').value = 'cc-1';
document.getElementById('nf-centro-custo').dispatchEvent(new dom.window.Event('change'));
document.getElementById('nf-classe-conta').value = 'cl-1';
let confirmChamadoDeNovo = false;
dom.window.confirm = () => { confirmChamadoDeNovo = true; return true; };
document.getElementById('btn-salvar-nota').click();
await new Promise(r => setTimeout(r, 150));
checar(!confirmChamadoDeNovo, 'fornecedor sem contrato vencido não dispara nenhum confirm()');

checarSemErrosNaoTratados(erros, 'fornecedor_contrato_vencido_aviso');
relatorioFinal('fornecedor_contrato_vencido_aviso');
