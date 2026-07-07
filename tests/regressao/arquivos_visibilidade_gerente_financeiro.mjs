// gerente_financeiro vê Arquivos (via eh_super_usuario()), mas não
// Armazenamento (exclusivo do administrador).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.gerenteFinanceiro);

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
const tabs = Array.from(document.querySelectorAll('[data-config-tab]')).map(b => b.dataset.configTab);
checar(tabs.includes('arquivos'), 'gerente_financeiro vê a aba Arquivos');
checar(!tabs.includes('armazenamento'), 'gerente_financeiro não vê a aba Armazenamento');

checarSemErrosNaoTratados(erros, 'arquivos_visibilidade_gerente_financeiro');
relatorioFinal('arquivos_visibilidade_gerente_financeiro');
