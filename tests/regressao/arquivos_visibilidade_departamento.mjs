// departamento NÃO deve ver a aba Arquivos (nem Armazenamento) --
// operador_cadastro exige contas_a_pagar/gerente_financeiro/administrador.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.departamento);

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
const tabs = Array.from(document.querySelectorAll('[data-config-tab]')).map(b => b.dataset.configTab);
checar(!tabs.includes('arquivos'), 'departamento não vê a aba Arquivos');
checar(!tabs.includes('armazenamento'), 'departamento não vê a aba Armazenamento');

checarSemErrosNaoTratados(erros, 'arquivos_visibilidade_departamento');
relatorioFinal('arquivos_visibilidade_departamento');
