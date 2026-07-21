// Parcelamento (pedido do dono do produto, ponto 6): diferente do
// rateio, cada parcela vira uma NOTA própria (vencimento e valor
// diferentes, seguindo o fluxo de aprovação inteiro de forma
// independente) -- não uma linha auxiliar dentro da mesma nota. A tela é
// "parecida com o rateio" (uma tabela editável), mas ao salvar gera N
// chamadas a db.criarNota, todas ligadas por um parcelamento_id em comum.
// A alçada (LIMITE_APROVACAO_GESTOR = R$5.000, ver config.js) é conferida
// PARA CADA parcela com o valor DELA, não do total -- por isso o teste usa
// duas parcelas de valores bem diferentes (R$3.000 e R$9.000) a partir de
// um bruto de R$12.000, pra confirmar que uma nasce "aprovado" e a outra
// "lancado" (aguardando aprovação) mesmo sendo do mesmo lançamento.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.departamento);

document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));

checar(!!document.getElementById('nf-tem-parcelamento'), 'nota nova tem a opção de pagamento parcelado');

document.getElementById('nf-emissao').value = '2026-06-01';
document.getElementById('nf-vencimento').value = '2026-07-01';
document.getElementById('nf-competencia').value = '2026-06';
document.getElementById('nf-numero').value = 'NF-PARC-1';
document.getElementById('nf-valor').value = '12000';
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

// Liga o parcelamento -- área de geração aparece.
document.getElementById('nf-tem-parcelamento').value = 'sim';
document.getElementById('nf-tem-parcelamento').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
checar(!!document.getElementById('btn-parcelas-gerar'), 'área de parcelamento mostra o botão de gerar parcelas');

document.getElementById('pc-num-parcelas').value = '2';
document.getElementById('btn-parcelas-gerar').click();
await new Promise(r => setTimeout(r, 50));
let linhas = document.querySelectorAll('[data-parcela-valor]');
checar(linhas.length === 2, 'gerou 2 linhas de parcela');
checar(Math.abs(parseFloat(linhas[0].value) + parseFloat(linhas[1].value) - 12000) < 0.01, 'soma das 2 parcelas geradas iguais bate com o valor bruto (R$12.000)');

// Edita os valores pra ficarem bem diferentes (R$3.000 e R$9.000) --
// confirma a alçada por parcela, não pelo total.
document.querySelector('[data-parcela-valor="0"]').value = '3000';
document.querySelector('[data-parcela-valor="0"]').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
document.querySelector('[data-parcela-valor="1"]').value = '9000';
document.querySelector('[data-parcela-valor="1"]').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
checar(document.body.textContent.includes('Saldo') && !document.body.textContent.includes('precisa fechar em zero'), 'depois do ajuste manual, a soma das parcelas volta a bater com o valor bruto');

// Espera o clique de verdade (await no próprio onclick, não um
// setTimeout com um número chutado): o parcelamento faz várias chamadas
// sequenciais ao "banco" por parcela (criarNota + promoverStatusNota,
// uma vez pra cada uma) dentro do mesmo clique -- um delay fixo se
// mostrou instável (flaky) pra 2 parcelas, variando com a carga da
// máquina que roda o teste.
await document.getElementById('btn-salvar-nota').onclick();
checar(!!document.querySelector('.flash'), 'flash de confirmação aparece depois de lançar o parcelamento');
// Conteúdo do flash vem de escapeHtml() (via innerText), que o jsdom não
// implementa de verdade -- sempre devolve vazio nesse ambiente (mesmo bug
// documentado em vários outros testes desta suíte). Checa a string real
// direto no estado, não o texto renderizado no DOM.
const { app } = await import('./app/src/js/state.js');
checar(app.state.flash.includes('2 parcelas'), 'flash menciona a quantidade de parcelas lançadas');

const fixturesNotas = supabaseClientMod.__fixtures().notas;
const parcela1 = fixturesNotas.find(n => n.numero_nota === 'NF-PARC-1 (1/2)');
const parcela2 = fixturesNotas.find(n => n.numero_nota === 'NF-PARC-1 (2/2)');
checar(!!parcela1 && !!parcela2, 'as 2 parcelas foram criadas como notas separadas, com NF sufixada');
checarIgual(parcela1.valor_bruto, 3000, 'parcela 1/2 fica com o valor editado (R$3.000)');
checarIgual(parcela2.valor_bruto, 9000, 'parcela 2/2 fica com o valor editado (R$9.000)');
checar(!!parcela1.parcelamento_id && parcela1.parcelamento_id === parcela2.parcelamento_id, 'as 2 parcelas compartilham o mesmo parcelamento_id');
checarIgual(parcela1.parcela_numero, 1, 'parcela 1 tem parcela_numero = 1');
checarIgual(parcela1.parcela_total, 2, 'parcela 1 sabe que o total é 2');
checarIgual(parcela2.parcela_numero, 2, 'parcela 2 tem parcela_numero = 2');
checarIgual(parcela1.status, 'aprovado', 'parcela de R$3.000 (dentro da alçada) nasce aprovada automaticamente');
checarIgual(parcela2.status, 'lancado', 'parcela de R$9.000 (acima da alçada) fica aguardando aprovação do gerente -- mesmo lançamento, alçada por parcela');
checarIgual(parcela1.criado_por, PERFIS.departamento.usuarioId, 'as parcelas ficam registradas em nome de quem lançou');
checar(parcela2.vencimento > parcela1.vencimento, 'vencimento da parcela 2 é depois da parcela 1 (intervalo mensal a partir do vencimento base)');

// Detalhe de uma parcela mostra a tabela com as duas, cruzando pro id da
// outra.
document.querySelector('[data-view="minhas"]').click();
await new Promise(r => setTimeout(r, 100));
checar(!!document.querySelector(`.nota-card[data-open="${parcela1.id}"] .pend-badge`), 'card da parcela 1 mostra o badge "Parcela 1/2"');
document.querySelector(`[data-open="${parcela1.id}"]`).click();
await new Promise(r => setTimeout(r, 100));
checar(document.body.textContent.includes('Parcelamento (parcela 1/2)'), 'detalhe da parcela 1 mostra o título da seção de parcelamento');
checar(!!document.querySelector(`[data-open="${parcela2.id}"]`), 'detalhe da parcela 1 tem um link pra abrir a parcela 2');

checarSemErrosNaoTratados(erros, 'parcelamento');
relatorioFinal('parcelamento');
