// Regra combinada com o Contas a Pagar (ver conversa sobre o documento
// WE9 "Processos de Contas a Pagar"): pagamento comum (não exceção) só
// vence às quartas-feiras, calculado a partir da janela de lançamento
// sexta-a-quinta -- assim o CP sempre tem a sexta-feira livre pra fechar
// a semana e abrir os chamados, sem lançamento novo atrapalhando.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.departamento);
const { calcularVencimentoComum, pascoa, feriadosNacionais } = await import('./app/src/js/vencimento_comum.js');

// 1) Cenário exato descrito: lançamento na janela sexta 26/06 a quinta
// 02/07/2026 só pode vencer em 05/08/2026; lançamento já na sexta
// seguinte (03/07) vence em 12/08/2026.
checarIgual(calcularVencimentoComum(new Date(2026, 5, 26)), '2026-08-05', 'lançamento na sexta que abre a janela (26/06) -> vencimento 05/08');
checarIgual(calcularVencimentoComum(new Date(2026, 5, 27)), '2026-08-05', 'lançamento no sábado (27/06, dentro da janela) -> mesmo vencimento 05/08');
checarIgual(calcularVencimentoComum(new Date(2026, 6, 1)), '2026-08-05', 'lançamento na quarta-feira da própria janela (01/07) -> mesmo vencimento 05/08');
checarIgual(calcularVencimentoComum(new Date(2026, 6, 2)), '2026-08-05', 'lançamento na quinta que fecha a janela (02/07) -> mesmo vencimento 05/08');
checarIgual(calcularVencimentoComum(new Date(2026, 6, 3)), '2026-08-12', 'lançamento já na sexta seguinte (03/07, janela nova) -> vencimento vira 12/08');

// 2) O resultado é sempre uma quarta-feira.
for (const dataBase of [new Date(2026, 5, 26), new Date(2026, 6, 3), new Date(2026, 9, 15)]) {
  const alvo = calcularVencimentoComum(dataBase);
  const dow = new Date(alvo + 'T12:00:00').getDay();
  checar(dow === 3, `${alvo} (base ${dataBase.toISOString().slice(0, 10)}) cai numa quarta-feira (getDay()=${dow})`);
}

// 3) Dia 1º do mês empurra pra próxima quarta-feira, não pra qualquer
// outro dia útil (regra combinada: só quarta, nunca "dia útil mais próximo").
checarIgual(calcularVencimentoComum(new Date(2026, 1, 20)), '2026-04-08', 'quarta calculada cairia em 01/04 (dia 1º) -> empurra pra 08/04');
checarIgual(calcularVencimentoComum(new Date(2026, 4, 22)), '2026-07-08', 'quarta calculada cairia em 01/07 (dia 1º) -> empurra pra 08/07');

// 4) Feriado nacional empurra igual (Tiradentes 21/04/2027 cai numa
// quarta nesse ano -- confirmado à parte com `date -d`).
checarIgual(calcularVencimentoComum(new Date(2027, 2, 12)), '2027-04-28', 'quarta calculada cairia em 21/04/2027 (Tiradentes) -> empurra pra 28/04');

// 5) Páscoa (Meeus/Jones/Butcher) bate com a data conhecida de 2026.
checarIgual(pascoa(2026).toISOString().slice(0, 10), '2026-04-05', 'Páscoa 2026 calculada corretamente (05/04)');
checar(feriadosNacionais(2026).has('2026-12-25'), 'Natal está no conjunto de feriados nacionais');
checar(feriadosNacionais(2026).has('2026-04-03'), 'Sexta-feira Santa 2026 (Páscoa - 2) está no conjunto de feriados');
checar(!feriadosNacionais(2026).has('2026-04-05'), 'domingo de Páscoa em si não é feriado bancário (só a sexta-feira santa antes)');

// 6) Fim a fim: departamento abre o formulário de nota nova -- vencimento
// já vem SUGERIDO com a quarta calculada, mas o campo nunca fica
// travado (pode editar livremente, mesmo com tipo de despesa "padrão").
document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));

const vencimentoInput = document.getElementById('nf-vencimento');
const selTipoDespesa = document.getElementById('nf-tipo-despesa');
checar(!!selTipoDespesa, 'formulário de nota nova mostra o seletor de tipo de despesa');
checar(selTipoDespesa.value === 'padrao', 'tipo de despesa vem "padrão" por padrão');
checar(!vencimentoInput.hasAttribute('readonly'), 'campo de vencimento nunca fica travado, mesmo com tipo "padrão"');
checar(vencimentoInput.value === calcularVencimentoComum(), 'campo de vencimento já vem sugerido com a quarta-feira calculada pra hoje');

selTipoDespesa.value = 'dare';
selTipoDespesa.dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
checar(!vencimentoInput.hasAttribute('readonly'), 'trocar o tipo de despesa continua sem travar o campo (nunca trava)');

vencimentoInput.value = '2026-12-24'; // data livre, escolhida à mão (exceção)
document.getElementById('nf-emissao').value = '2026-12-01';
document.getElementById('nf-competencia').value = '2026-12';
document.getElementById('nf-numero').value = 'NF-EXCECAO-1';
document.getElementById('nf-valor').value = '500';
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

const notaExcecao = supabaseClientMod.__fixtures().notas.find(n => n.numero_nota === 'NF-EXCECAO-1');
checar(!!notaExcecao, 'a nota de exceção foi criada');
checarIgual(notaExcecao && notaExcecao.vencimento, '2026-12-24', 'vencimento livre (exceção) foi salvo exatamente como digitado, sem regra de quarta-feira');
checarIgual(notaExcecao && notaExcecao.pagamento_excecao, true, 'a nota fica marcada como pagamento_excecao=true no banco (derivado do tipo de despesa)');
checarIgual(notaExcecao && notaExcecao.tipo_despesa_prazo, 'dare', 'a nota fica salva com o tipo de despesa escolhido (dare)');

checarSemErrosNaoTratados(erros, 'vencimento_comum_regra_quarta_feira');
relatorioFinal('vencimento_comum_regra_quarta_feira');
