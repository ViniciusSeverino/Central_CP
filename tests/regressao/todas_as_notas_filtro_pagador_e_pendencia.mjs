// Mais dois filtros de "Todas as notas": por pagador, e por pendência
// (sim/não) -- cada um isolado, sem combinar com o de status já testado
// em todas_as_notas_filtros_e_totais.mjs.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { dom, document, erros, supabaseClientMod } = await bootApp(PERFIS.administrador);
const todasFixture = supabaseClientMod.__fixtures().notas;

document.querySelector('[data-view="todas"]').click();
await new Promise(r => setTimeout(r, 100));

document.getElementById('f-pagador').value = 'pag-2';
document.getElementById('f-pagador').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
const qtdPag2 = todasFixture.filter(n => n.pagador_id === 'pag-2').length;
checar(document.querySelectorAll('table.data-tbl tbody tr.row-click').length === qtdPag2, `filtro por pagador (FPP) mostra só as ${qtdPag2} nota(s) desse pagador`);
document.getElementById('btn-limpar-filtros').click();
await new Promise(r => setTimeout(r, 50));

document.getElementById('f-pendente').value = 'sim';
document.getElementById('f-pendente').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
const qtdPendentes = todasFixture.filter(n => n.pendente).length;
checar(document.querySelectorAll('table.data-tbl tbody tr.row-click').length === qtdPendentes, `filtro "só com pendência" mostra exatamente as ${qtdPendentes} nota(s) pendente(s)`);

document.getElementById('f-pendente').value = 'nao';
document.getElementById('f-pendente').dispatchEvent(new dom.window.Event('change'));
await new Promise(r => setTimeout(r, 50));
const qtdNaoPendentes = todasFixture.filter(n => !n.pendente).length;
checar(document.querySelectorAll('table.data-tbl tbody tr.row-click').length === qtdNaoPendentes, `filtro "só sem pendência" mostra exatamente as ${qtdNaoPendentes} nota(s)`);

checarSemErrosNaoTratados(erros, 'todas_as_notas_filtro_pagador_e_pendencia');
relatorioFinal('todas_as_notas_filtro_pagador_e_pendencia');
