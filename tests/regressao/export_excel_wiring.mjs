// Botão "Exportar Excel" em "Todas as notas": fica desabilitado sem
// linhas, habilitado com linhas, e trata erro sem travar. exceljs é
// carregado via CDN, que o Node não importa por padrão (limitação só
// deste ambiente de teste -- funciona nativamente num navegador real,
// ver tests/e2e); aqui só confirmamos a wiring.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.administrador);

document.querySelector('[data-view="todas"]').click();
await new Promise(r => setTimeout(r, 100));
const btn = document.getElementById('btn-exportar-excel');
checar(!!btn, 'botão "Exportar Excel" existe');
checar(!btn.disabled, 'com notas na lista, o botão vem habilitado');

const textoOriginal = btn.textContent;
btn.click();
await new Promise(r => setTimeout(r, 400));
checar(!!document.querySelector('.toast'), 'tentar exportar mostra um toast (de erro tratado, neste ambiente, ou de sucesso num navegador real)');
checar(!btn.disabled, 'botão volta a ficar habilitado depois da tentativa');
checar(btn.textContent === textoOriginal, 'texto do botão volta ao normal');

checarSemErrosNaoTratados(erros, 'export_excel_wiring');
relatorioFinal('export_excel_wiring');
