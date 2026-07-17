// contas_a_pagar agora também lança nota, mas só pro setor Financeiro
// (setor fixo, sem select manual) -- e segue a MESMA alçada por valor que
// o departamento já tinha, não auto-aprova só por autoridade (decisão
// explícita do dono do produto: manter a separação entre quem lança e
// quem aprova/executa). Ver 0024_cp_lanca_para_financeiro_e_todas_notas_geral.sql.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.contasAPagar);

checar(!!document.getElementById('btn-nova-nota'), 'contas_a_pagar vê o botão de nova nota');

document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));
const setorEl = document.getElementById('nf-setor');
checar(!!setorEl, 'campo de setor existe no formulário');
checar(setorEl.tagName === 'INPUT' && setorEl.type === 'hidden' && setorEl.value === 'Financeiro', 'setor vem travado em "Financeiro" (input oculto, não um select pra escolher)');

// Caso 1: valor ACIMA da alçada -- não auto-aprova só porque é o
// contas_a_pagar lançando, segue pra aprovação do gerente igual uma nota
// de departamento (ver statusInicialParaValor em events_notas.js).
document.getElementById('nf-emissao').value = '2026-07-01';
document.getElementById('nf-vencimento').value = '2026-07-20';
document.getElementById('nf-competencia').value = '2026-07';
document.getElementById('nf-numero').value = 'NF-CP-ALCADA';
document.getElementById('nf-valor').value = '9000'; // acima da alçada (limite = 5000)
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

const notaAlcada = supabaseClientMod.__fixtures().notas.find(n => n.numero_nota === 'NF-CP-ALCADA');
checar(!!notaAlcada, 'nota acima da alçada foi criada');
checar(notaAlcada && notaAlcada.status === 'lancado', 'valor acima da alçada (R$9.000 > R$5.000) NÃO auto-aprova -- fica "lancado", aguardando aprovação do gerente financeiro, igual departamento');
checar(notaAlcada && notaAlcada.setor === 'Financeiro', 'setor salvo é "Financeiro"');
checar(notaAlcada && notaAlcada.criado_por === PERFIS.contasAPagar.usuarioId, 'nota fica registrada em nome do contas_a_pagar que lançou');

// Caso 2: valor DENTRO da alçada -- aprova automaticamente, mesma regra
// que já vale pro departamento.
document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));
document.getElementById('nf-emissao').value = '2026-07-01';
document.getElementById('nf-vencimento').value = '2026-07-20';
document.getElementById('nf-competencia').value = '2026-07';
document.getElementById('nf-numero').value = 'NF-CP-DENTRO';
document.getElementById('nf-valor').value = '1000'; // dentro da alçada
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

const notaDentro = supabaseClientMod.__fixtures().notas.find(n => n.numero_nota === 'NF-CP-DENTRO');
checar(!!notaDentro, 'nota dentro da alçada foi criada');
checar(notaDentro && notaDentro.status === 'aprovado', 'valor dentro da alçada (R$1.000 < R$5.000) aprova automaticamente');

checarSemErrosNaoTratados(erros, 'ciclo_contas_a_pagar_lanca_para_financeiro');
relatorioFinal('ciclo_contas_a_pagar_lanca_para_financeiro');
