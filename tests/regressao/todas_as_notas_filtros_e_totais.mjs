// "Todas as notas": a tabela lista tudo que o administrador enxerga
// (RLS/mock não filtra pra super_usuario), o rodapé soma o valor_bruto
// certo, e o filtro de status realmente restringe a lista.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.administrador);
const todasDoBanco = supabaseClientMod.__fixtures().notas;
// Notas do perfil "recebedor" (status 'recebido', ver migration 0029)
// ainda não têm vencimento -- caem fora do filtro PADRÃO (ano corrente),
// igual qualquer outra nota sem data cairia. "Limpar filtros" zera até o
// intervalo de datas (não só volta pro ano corrente), então essas voltam
// a aparecer nesse caso -- por isso usa todasDoBanco (sem filtro nenhum)
// só naquela checagem, e este recorte (com vencimento) pro resto.
const todasFixture = todasDoBanco.filter(n => n.vencimento);

document.querySelector('[data-view="todas"]').click();
await new Promise(r => setTimeout(r, 150));

const rows = document.querySelectorAll('table.data-tbl tbody tr.row-click');
checar(rows.length === todasFixture.length, `tabela mostra as ${todasFixture.length} nota(s) do fixture (filtro de ano corrente cobre todas, já que as datas de vencimento do fixture são de 2026)`);

const totalEsperado = todasFixture.reduce((s, n) => s + Number(n.valor_bruto), 0);
const footerText = document.querySelector('table.data-tbl tfoot').textContent.replace(/\s+/g, ' ');
checar(footerText.includes(String(rows.length)), 'rodapé mostra a quantidade certa de notas');
const totalNoFooter = Number(footerText.match(/R\$\s*([\d.,]+)/)?.[1]?.replace(/\./g, '').replace(',', '.'));
checar(Math.abs(totalNoFooter - totalEsperado) < 0.01, `rodapé soma o valor_bruto certo (R$ ${totalEsperado.toFixed(2)})`);

document.getElementById('f-status').value = 'pago';
document.getElementById('f-status').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
const qtdPagas = todasFixture.filter(n => n.status === 'pago').length;
checar(document.querySelectorAll('table.data-tbl tbody tr.row-click').length === qtdPagas, `filtro de status "pago" mostra só as ${qtdPagas} nota(s) pagas`);

document.getElementById('btn-limpar-filtros').click();
await new Promise(r => setTimeout(r, 50));
// "Limpar filtros" zera até o intervalo de datas (não só volta pro ano
// corrente) -- por isso o total aqui é o do banco inteiro, incluindo as
// notas 'recebido' sem vencimento que ficavam de fora do filtro padrão.
checar(document.querySelectorAll('table.data-tbl tbody tr.row-click').length === todasDoBanco.length, '"Limpar filtros" volta a mostrar todas');

checarSemErrosNaoTratados(erros, 'todas_as_notas_filtros_e_totais');
relatorioFinal('todas_as_notas_filtros_e_totais');
