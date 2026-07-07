// administrador vê tanto Arquivos quanto Armazenamento.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.administrador);

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
const tabs = Array.from(document.querySelectorAll('[data-config-tab]')).map(b => b.dataset.configTab);
checar(tabs.includes('arquivos'), 'administrador vê a aba Arquivos');
checar(tabs.includes('armazenamento'), 'administrador vê a aba Armazenamento');

checarSemErrosNaoTratados(erros, 'arquivos_visibilidade_administrador');
relatorioFinal('arquivos_visibilidade_administrador');
