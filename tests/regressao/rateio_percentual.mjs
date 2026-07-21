// Rateio por porcentagem: além do valor em R$, o campo "Valor do rateio"
// agora tem um seletor de modo (R$ / %) -- quando em "%", o número digitado
// é convertido pra R$ (percentual do valor bruto) antes de entrar em
// app.rateioTemp, que continua guardando só o valor final em R$ (mesmo
// princípio já usado no imposto: computa uma vez, guarda no formato que já
// existia). Cobre: inclusão em modo %, arredondamento, validação de saldo
// também em modo %, e que o modo "R$" (default) continua funcionando como
// antes (não quebrou o fluxo do lote, que também usa esse componente).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarIgual, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros } = await bootApp(PERFIS.departamento);
const { app } = await import('./app/src/js/state.js');

document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));

document.getElementById('nf-emissao').value = '2026-06-01';
document.getElementById('nf-vencimento').value = '2026-07-01';
document.getElementById('nf-competencia').value = '2026-06';
document.getElementById('nf-numero').value = 'NF-RATEIO-PCT';
document.getElementById('nf-valor').value = '1000';
document.getElementById('nf-valor').dispatchEvent(new dom.window.Event('input'));
document.getElementById('nf-pagador').value = 'pag-1';
document.getElementById('nf-pagador').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
document.getElementById('nf-fornecedor').value = 'forn-1';
document.getElementById('nf-forma-pagamento').value = 'Boleto bancário';

const selTemRateio = document.getElementById('nf-tem-rateio');
selTemRateio.value = 'sim';
selTemRateio.dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));

checar(!!document.getElementById('rt-modo'), 'área de rateio tem o seletor de modo R$/%');
checarIgual(document.getElementById('rt-modo').value, 'valor', 'modo nasce em "R$" por padrão (não muda o comportamento de quem já usava só valor)');

// 1) Modo "%": inclui uma linha de 30% de R$ 1.000 -- deve virar R$ 300.
document.getElementById('rt-modo').value = 'percentual';
document.getElementById('rt-modo').dispatchEvent(new dom.window.Event('change'));
document.getElementById('rt-valor').value = '30';
document.getElementById('rt-valor').dispatchEvent(new dom.window.Event('input'));
await new Promise(r => setTimeout(r, 30));
const hint1 = document.getElementById('rt-valor-hint').textContent;
checar(hint1.includes('30') && hint1.includes('300'), 'hint ao vivo mostra a equivalência 30% -> R$ 300,00 em modo percentual');

document.getElementById('rt-centro').value = 'cc-1';
document.getElementById('rt-centro').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
document.getElementById('rt-classe').value = 'cl-1';
document.getElementById('btn-rateio-incluir').click();
await new Promise(r => setTimeout(r, 50));

checarIgual(app.rateioTemp.length, 1, 'incluiu a linha de rateio em modo percentual');
checarIgual(app.rateioTemp[0].valor, 300, '30% de R$ 1.000 vira R$ 300 guardado em app.rateioTemp (mesmo formato de sempre)');

// 2) Modo "%" acima do saldo disponível deve ser bloqueado (saldo restante
// é 700, e 80% de 1000 = 800 > 700). refreshRateioArea() reconstrói a área
// inteira a cada inclusão (mesmo padrão do resto do form), então o modo e
// os selects de centro/classe voltam ao padrão -- precisa reselecionar tudo,
// não só o campo que este passo testa.
document.getElementById('rt-modo').value = 'percentual';
document.getElementById('rt-modo').dispatchEvent(new dom.window.Event('change'));
document.getElementById('rt-valor').value = '80';
document.getElementById('rt-valor').dispatchEvent(new dom.window.Event('input'));
document.getElementById('rt-centro').value = 'cc-1';
document.getElementById('rt-centro').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
document.getElementById('rt-classe').value = 'cl-1';
document.getElementById('btn-rateio-incluir').click();
await new Promise(r => setTimeout(r, 30));
checarIgual(app.rateioTemp.length, 1, '80% (R$ 800) acima do saldo restante (R$ 700) é bloqueado, não inclui segunda linha');
checar(Array.from(document.querySelectorAll('.toast')).pop().textContent.includes('saldo disponível'), 'mostra o toast de saldo insuficiente também quando o valor vem convertido de %');

// 3) Volta pro modo "R$" e inclui o restante do saldo (700) direto em
// valor -- confirma que o modo R$ segue funcionando exatamente como antes.
document.getElementById('rt-modo').value = 'valor';
document.getElementById('rt-modo').dispatchEvent(new dom.window.Event('change'));
document.getElementById('rt-valor').value = '700';
document.getElementById('rt-valor').dispatchEvent(new dom.window.Event('input'));
document.getElementById('rt-centro').value = 'cc-1';
document.getElementById('rt-centro').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
document.getElementById('rt-classe').value = 'cl-1';
document.getElementById('btn-rateio-incluir').click();
await new Promise(r => setTimeout(r, 50));
checarIgual(app.rateioTemp.length, 2, 'modo "R$" inclui a segunda linha normalmente');
checarIgual(app.rateioTemp[1].valor, 700, 'segunda linha guarda o valor em R$ exatamente como digitado (modo R$ não converte nada)');

checar(document.body.textContent.includes('Valor totalmente rateado'), 'com as duas linhas (300 + 700 = 1000) o saldo zera e a área mostra o aviso de totalmente rateado');

checarSemErrosNaoTratados(erros, 'rateio_percentual');
relatorioFinal('rateio_percentual');
