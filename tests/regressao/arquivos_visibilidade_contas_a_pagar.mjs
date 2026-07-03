// contas_a_pagar vê Arquivos, mas não Armazenamento.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.contasAPagar);

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
const tabs = Array.from(document.querySelectorAll('[data-cad-tab]')).map(b => b.dataset.cadTab);
checar(tabs.includes('arquivos'), 'contas_a_pagar vê a aba Arquivos');
checar(!tabs.includes('armazenamento'), 'contas_a_pagar não vê a aba Armazenamento');

checarSemErrosNaoTratados(erros, 'arquivos_visibilidade_contas_a_pagar');
relatorioFinal('arquivos_visibilidade_contas_a_pagar');
