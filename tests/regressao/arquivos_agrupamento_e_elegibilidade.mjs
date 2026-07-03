// Aba Arquivos: só entram no agrupamento notas com chamado aberto, com
// anexo de verdade, e ainda não arquivadas -- e o agrupamento é por
// pagador + tipo de nota (classificação).
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros } = await bootApp(PERFIS.administrador);

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
document.querySelector('[data-cad-tab="arquivos"]').click();
await new Promise(r => setTimeout(r, 100));

const grupos = document.querySelectorAll('.grupo-card');
checar(grupos.length === 1, 'só 1 grupo elegível aparece (nota-5: Condomínio + Serviço)');
checar(document.querySelectorAll('[data-baixar-zip-arquivo]').length === 1, 'só 1 grupo elegível gera botão de baixar zip (nota-6 arquivada e nota-7 sem chamado ficam de fora)');
checar(document.body.textContent.includes('1 nota(s) com anexo'), 'o grupo mostra exatamente 1 nota pronta pra arquivar');

const key = document.querySelector('[data-baixar-zip-arquivo]').dataset.baixarZipArquivo;
const { notasDoGrupo } = await import('./app/src/js/ui_arquivos.js');
const grupo = notasDoGrupo(key);
checar(grupo.tipo === 'Nota de Serviço', 'o grupo é tipado corretamente como "Nota de Serviço" (checado nos dados, não no texto -- escapeHtml() zera texto no jsdom, é limitação só do ambiente de teste)');
checar(grupo.pagador_id === 'pag-1', 'o grupo é do pagador certo (Condomínio)');
checar(grupo.notas.length === 1 && grupo.notas[0].id === 'nota-5', 'o grupo contém exatamente a nota-5');

checarSemErrosNaoTratados(erros, 'arquivos_agrupamento_e_elegibilidade');
relatorioFinal('arquivos_agrupamento_e_elegibilidade');
