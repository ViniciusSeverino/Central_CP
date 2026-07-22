// Excluir uma nota "recebida" pendente pelo perfil "completo" (ver
// ui_nota.js/migration 0035): no lugar do antigo botão duplicado que
// reabria o formulário completo, "completo" ganhou a opção de excluir de
// vez -- é lançamento simples que nunca saiu do "recebido", sem nada fora
// do Central CP referenciando ainda. Teste isolado num arquivo próprio
// porque o clique de verdade remove a nota do fixture, e outros cenários
// de recebimento_perfil_completo.mjs ainda usam esse mesmo id depois.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, checarSemErrosNaoTratados, relatorioFinal } from './lib/assert.mjs';

const { document, erros, supabaseClientMod } = await bootApp(PERFIS.departamento);

document.querySelector('[data-view="recebidos"]').click();
await new Promise(r => setTimeout(r, 100));
document.querySelector('[data-open="nota-recebida-pendente-1"]').click();
await new Promise(r => setTimeout(r, 100));

const btnExcluir = document.querySelector('[data-excluir-nota="nota-recebida-pendente-1"]');
checar(!!btnExcluir, '"completo" vê o botão "Excluir" na nota recebida pendente do próprio setor');
btnExcluir.click();
await new Promise(r => setTimeout(r, 150));

checar(!supabaseClientMod.__fixtures().notas.some(n => n.id === 'nota-recebida-pendente-1'), 'excluir remove a nota de vez');
checar(!!document.querySelector('.flash'), 'mostra a confirmação de exclusão');

checarSemErrosNaoTratados(erros, 'recebimento_completo_exclui_pendente');
relatorioFinal('recebimento_completo_exclui_pendente');
