// Bug real de produção (lançamento de teste do usuário): a tela mostrava
// "22/07/2026" de vencimento pra uma nota cujo PDF de anexo (gerado por
// dataDdMm() em anexos_pdf.js, que fatia a string ISO direto, sem Date)
// tinha "23-07" no nome -- ou seja, a data ARMAZENADA era 23/07, só a TELA
// mostrava errado. Causa: fmtDate() fazia `new Date("2026-07-23")`, que o
// JS interpreta como meia-noite UTC, e ao formatar em fuso local (Brasil,
// UTC-3) isso vira 21h do dia 22 -- um dia pra trás. Este teste garante que
// coluna DATE pura (sem hora) nunca mais passa por Date/fuso nenhum, e que
// timestamp de verdade (com hora, tipo anexo_arquivado_em) continua correto.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checarIgual, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.departamento);
const { fmtDate } = await import('./app/src/js/state.js');

// 1) Função pura: nenhuma data-only (YYYY-MM-DD) pode se deslocar.
checarIgual(fmtDate('2026-07-23'), '23/07/2026', 'fmtDate NÃO desloca data pura (bug real: vencimento 23/07 aparecia como 22/07)');
checarIgual(fmtDate('2026-01-01'), '01/01/2026', 'fmtDate NÃO desloca data pura na virada de ano (caso mais sensível ao bug)');
checarIgual(fmtDate('2026-12-31'), '31/12/2026', 'fmtDate NÃO desloca data pura no fim do ano');
checarIgual(fmtDate(null), '—', 'fmtDate(null) continua mostrando "—"');
checarIgual(fmtDate(''), '—', 'fmtDate("") continua mostrando "—"');

// 2) Timestamp de verdade (com hora/fuso, ex: anexo_arquivado_em) continua
// convertendo pro fuso local -- isso aqui é o comportamento CERTO, não o bug.
const comHora = fmtDate('2026-07-23T10:00:00.000Z');
checarIgual(/^23\/07\/2026$/.test(comHora), true, 'fmtDate com timestamp de verdade (hora incluída) ainda formata corretamente');

// 3) Fim a fim: lançar uma nota de verdade com vencimento 23/07 e conferir
// que a tela de detalhe mostra 23/07, não 22/07 -- o cenário exato do bug relatado.
document.getElementById('btn-nova-nota').click();
await new Promise(r => setTimeout(r, 100));

document.getElementById('nf-emissao').value = '2026-07-01';
document.getElementById('nf-vencimento').value = '2026-07-23';
document.getElementById('nf-competencia').value = '2026-07';
document.getElementById('nf-numero').value = 'NF-VENC-1';
document.getElementById('nf-valor').value = '400';
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

const nota = supabaseClientMod.__fixtures().notas.find(n => n.numero_nota === 'NF-VENC-1');
checarIgual(nota && nota.vencimento, '2026-07-23', 'a nota foi salva com vencimento 2026-07-23 (data pura, sem hora)');

document.querySelector(`.nota-card[data-open="${nota.id}"]`).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 100));

const linhas = Array.from(document.querySelectorAll('.detalhe .k, .k'));
const linhaVencimento = linhas.find(el => el.textContent.trim() === 'Data de vencimento');
const valorNaTela = linhaVencimento ? linhaVencimento.nextElementSibling.textContent.trim() : null;
checarIgual(valorNaTela, '23/07/2026', 'tela de detalhe mostra "Data de vencimento" 23/07/2026 -- não 22/07 (cenário exato do bug relatado em produção)');

checarSemErrosNaoTratados(erros, 'fmtDate_data_pura_sem_deslocamento_de_fuso');
relatorioFinal('fmtDate_data_pura_sem_deslocamento_de_fuso');
