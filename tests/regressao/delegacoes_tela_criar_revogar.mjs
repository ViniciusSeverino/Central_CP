// Tela Cadastros → Delegações: criar uma delegação nova e revogar uma
// já existente.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros, supabaseClientMod } = await bootApp(PERFIS.administrador);
const qtdInicial = supabaseClientMod.__fixtures().delegacoes.length;

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
document.querySelector('[data-cad-tab="delegacoes"]').click();
await new Promise(r => setTimeout(r, 100));
checar(document.querySelectorAll('.data-tbl tbody tr').length === qtdInicial, `tabela mostra as ${qtdInicial} delegação(ões) do fixture`);

document.getElementById('btn-nova-delegacao').click();
await new Promise(r => setTimeout(r, 100));
document.getElementById('dl-titular').value = 'u-dept-1';
document.getElementById('dl-delegado').value = 'u-dept-ferias-1';
document.getElementById('dl-inicio').value = '2026-07-01';
document.getElementById('dl-fim').value = '2026-07-15';
document.getElementById('confirmar-nova-delegacao').click();
await new Promise(r => setTimeout(r, 150));
checar(supabaseClientMod.__fixtures().delegacoes.length === qtdInicial + 1, 'delegação nova foi criada');

document.querySelector('[data-cad-tab="delegacoes"]').click();
await new Promise(r => setTimeout(r, 100));
checar(document.querySelectorAll('.data-tbl tbody tr').length === qtdInicial + 1, 'tabela reflete o total novo');

const btnRevogar = document.querySelector('[data-revogar-delegacao="dl-ativa"]');
checar(!!btnRevogar, 'delegação ativa mostra o botão "Revogar"');
btnRevogar.click();
await new Promise(r => setTimeout(r, 150));
checar(supabaseClientMod.__fixtures().delegacoes.find(d => d.id === 'dl-ativa').ativo === false, 'revogar marca ativo=false');

checarSemErrosNaoTratados(erros, 'delegacoes_tela_criar_revogar');
relatorioFinal('delegacoes_tela_criar_revogar');
