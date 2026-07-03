// Nota com rateio (mais de um centro de custo): "Todas as notas" mostra
// um toggle que expande/recolhe as linhas do rateio sem abrir modal.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros, supabaseClientMod } = await bootApp(PERFIS.administrador);
const nota8 = supabaseClientMod.__fixtures().notas.find(n => n.id === 'nota-8');
const qtdRateios = nota8.nota_rateios.length;

document.querySelector('[data-view="todas"]').click();
await new Promise(r => setTimeout(r, 100));

const toggle = document.querySelector('[data-toggle-rateio="nota-8"]');
checar(!!toggle, 'nota-8 (tem_rateio=true) mostra o toggle de expandir rateio');
checar(toggle.textContent.includes(String(qtdRateios)), `o toggle mostra a quantidade certa de linhas (${qtdRateios})`);
checar(document.querySelectorAll('tr.rateio-subrow').length === 0, 'rateio começa recolhido (nenhuma linha .rateio-subrow)');

toggle.click();
await new Promise(r => setTimeout(r, 50));
checar(document.querySelectorAll('tr.rateio-subrow').length === qtdRateios, `expandir mostra as ${qtdRateios} linha(s) reais de rateio da nota`);
checar(!document.querySelector('.modal-bg'), 'expandir o rateio NÃO abre nenhum modal (é inline na própria tabela)');

const somaExibida = Array.from(document.querySelectorAll('tr.rateio-subrow td.mono')).reduce((s, td) => s + Number(td.textContent.replace(/[^\d,.-]/g, '').replace(',', '.')), 0);
const somaFixture = nota8.nota_rateios.reduce((s, r) => s + Number(r.valor), 0);
checar(Math.abs(somaExibida - somaFixture) < 0.01, `soma das linhas exibidas (${somaExibida}) bate com a soma real do rateio (${somaFixture})`);
checar(Math.abs(somaFixture - Number(nota8.valor_bruto)) < 0.01, 'a soma do rateio no fixture bate com o valor_bruto da nota (dado consistente)');

toggle.click();
await new Promise(r => setTimeout(r, 50));
checar(document.querySelectorAll('tr.rateio-subrow').length === 0, 'clicar de novo recolhe as linhas');

checarSemErrosNaoTratados(erros, 'rateio_expandir_recolher_em_todas_notas');
relatorioFinal('rateio_expandir_recolher_em_todas_notas');
