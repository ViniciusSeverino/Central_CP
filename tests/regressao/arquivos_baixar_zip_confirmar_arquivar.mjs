// Fluxo completo de arquivar: baixar zip -> grupo marcado como "pronto" ->
// confirmar -> Storage limpo + anexo_arquivado_em setado + histórico
// registrado + grupo some da lista + detalhe mostra "Arquivado localmente".
//
// JSZip não roda de verdade no jsdom (feature-detection de Blob de
// navegador real -- mesma limitação documentada em anexos/PDF), então
// simulamos manualmente o "zip já baixado" via app.gruposArquivadosProntos
// pra exercitar a lógica real de confirmar/arquivar, que é o que importa.
import { bootApp, PERFIS } from './lib/boot.mjs';
import { checar, relatorioFinal, checarSemErrosNaoTratados } from './lib/assert.mjs';

const { document, erros, supabaseClientMod } = await bootApp(PERFIS.administrador);
const { app } = await import('./app/src/js/state.js');
const { render } = await import('./app/src/js/app.js');

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 100));
document.querySelector('[data-cad-tab="arquivos"]').click();
await new Promise(r => setTimeout(r, 100));

const key = document.querySelector('[data-baixar-zip-arquivo]').dataset.baixarZipArquivo;
checar(!document.querySelector(`[data-confirmar-arquivar="${key}"]`), 'botão de confirmar arquivamento NÃO aparece antes de "baixar" o zip');

app.gruposArquivadosProntos.add(key);
render();
await new Promise(r => setTimeout(r, 50));
const btnConfirmar = document.querySelector(`[data-confirmar-arquivar="${key}"]`);
checar(!!btnConfirmar, 'botão de confirmar aparece depois que o grupo é marcado como baixado');

btnConfirmar.click();
await new Promise(r => setTimeout(r, 300));

checar(!!document.querySelector('.flash'), 'flash de confirmação aparece depois de arquivar');
const nota5 = supabaseClientMod.__fixtures().notas.find(n => n.id === 'nota-5');
checar(!!nota5.anexo_arquivado_em, 'nota-5.anexo_arquivado_em foi setado');
checar(!supabaseClientMod.supabase.storage._objetos.some(o => o.path.startsWith('nota-5/')), 'o arquivo sumiu do Storage');
checar(supabaseClientMod.__fixtures().nota_historico.some(h => h.nota_id === 'nota-5' && h.acao === 'Anexo arquivado e removido do Storage'), 'histórico registrou o arquivamento');

document.querySelector('[data-view="cadastros"]').click();
await new Promise(r => setTimeout(r, 50));
document.querySelector('[data-cad-tab="arquivos"]').click();
await new Promise(r => setTimeout(r, 100));
checar(document.querySelectorAll('.grupo-card').length === 0, 'o grupo some da lista depois de arquivado (não tem mais nada elegível)');

app.state.modal = 'detalhe';
app.state.modalData = 'nota-5';
render();
await new Promise(r => setTimeout(r, 100));
checar(document.body.textContent.includes('Arquivado localmente'), 'detalhe da nota-5 mostra "Arquivado localmente" no lugar do link de download');
checar(!document.querySelector('[data-baixar-anexo]'), 'não sobra nenhum link de baixar anexo quebrado');
app.state.modal = null; app.state.modalData = null;

checarSemErrosNaoTratados(erros, 'arquivos_baixar_zip_confirmar_arquivar');
relatorioFinal('arquivos_baixar_zip_confirmar_arquivar');
